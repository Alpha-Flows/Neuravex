import { prisma } from "@/lib/prisma";

/**
 * Autosaves inside this window collapse into a single revision rather than
 * appending a new one. The editor autosaves 1.5s after every keystroke, so
 * without this a twenty-minute editing session left hundreds of near-identical
 * snapshots — each a full copy of the page — and buried the one version
 * anyone actually wants to go back to.
 */
export const AUTOSAVE_COALESCE_MS = 5 * 60 * 1000;

/** How many revisions to keep per page. Older ones are dropped on write. */
export const MAX_REVISIONS_PER_PAGE = 50;

/** The newest stored revision, or null when a page has none yet. */
export interface LatestRevision {
  title: string;
  content: string;
  manual: boolean;
  createdAt: Date;
}

export interface RevisionCandidate {
  title: string;
  content: string;
  /** A save the user asked for. Manual saves always get their own revision. */
  manual: boolean;
}

export type RevisionAction = "skip" | "replace" | "create";

/**
 * Decide what a save should do to the revision history.
 *
 * - `skip` — identical to the newest revision, so there is nothing to record.
 * - `replace` — an autosave close behind an earlier autosave. It takes that
 *   entry over, so the window keeps one revision tracking the latest state.
 * - `create` — anything else: a manual save, the first edit in a while, or an
 *   autosave following a manual one.
 */
export function decideRevisionAction(
  latest: LatestRevision | null,
  next: RevisionCandidate,
  now: number = Date.now(),
): RevisionAction {
  if (!latest) return "create";
  if (latest.content === next.content && latest.title === next.title) return "skip";
  if (next.manual) return "create";
  if (latest.manual) return "create";
  return now - latest.createdAt.getTime() < AUTOSAVE_COALESCE_MS ? "replace" : "create";
}

/** Record a revision for a page, unless there is nothing worth recording. */
export async function snapshotRevision(
  pageId: string,
  next: RevisionCandidate,
): Promise<RevisionAction> {
  const latest = await prisma.revision.findFirst({
    where: { pageId },
    orderBy: { createdAt: "desc" },
  });

  const action = decideRevisionAction(latest, next);
  if (action === "skip") return action;

  if (action === "replace" && latest) {
    await prisma.revision.update({
      where: { id: latest.id },
      data: { title: next.title, content: next.content, createdAt: new Date() },
    });
    return action;
  }

  await prisma.revision.create({ data: { pageId, ...next } });

  const stale = await prisma.revision.findMany({
    where: { pageId },
    orderBy: { createdAt: "desc" },
    skip: MAX_REVISIONS_PER_PAGE,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.revision.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
  }
  return action;
}
