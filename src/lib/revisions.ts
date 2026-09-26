import { prisma } from "@/lib/prisma";
import { normalizeBlockTreeJson } from "@/lib/block-tree";

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
  /** A named version is never taken over by an autosave. */
  name?: string | null;
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
  if (latest.manual || latest.name) return "create";
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

  // Named versions are kept however many there are: somebody chose to keep
  // each of them, and the fifty-save window is for the ones nobody did.
  const stale = await prisma.revision.findMany({
    where: { pageId, name: null },
    orderBy: { createdAt: "desc" },
    skip: MAX_REVISIONS_PER_PAGE,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.revision.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
  }
  return action;
}

/** The longest name a version can have. */
export const MAX_VERSION_NAME = 120;

/** A version's name, tidied, or null for none. */
export function cleanVersionName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, MAX_VERSION_NAME);
  return name || null;
}

type PageRow = { id: string; title: string; content: string };

/**
 * The page as it is saved, kept under a name. The save that stored it made
 * a revision already, so that one is named rather than copied when it is
 * still the newest and still unnamed; otherwise a named copy is made.
 */
export async function nameVersion(page: PageRow, name: string) {
  const latest = await prisma.revision.findFirst({ where: { pageId: page.id }, orderBy: { createdAt: "desc" } });
  if (latest && !latest.name && latest.content === page.content && latest.title === page.title) {
    return prisma.revision.update({ where: { id: latest.id }, data: { name, manual: true } });
  }
  return prisma.revision.create({ data: { pageId: page.id, title: page.title, content: page.content, manual: true, name } });
}

/**
 * A version put back, with the page as it was a moment before kept as a
 * version of its own, so the restore can be undone by restoring that.
 */
export async function restoreRevision(page: PageRow, revisionId: string) {
  const rev = await prisma.revision.findFirst({ where: { id: revisionId, pageId: page.id } });
  if (!rev) return null;
  const when = rev.createdAt.toISOString().slice(0, 16).replace("T", " ");
  const before = await prisma.revision.create({
    data: {
      pageId: page.id,
      title: page.title,
      content: page.content,
      manual: true,
      name: `Before restoring ${rev.name ? `“${rev.name}”` : `the version of ${when}`}`.slice(0, MAX_VERSION_NAME),
    },
  });
  // Through the validator, as every write is: a version kept before it
  // existed holds whatever the page held then.
  const tree = normalizeBlockTreeJson(rev.content);
  const updated = await prisma.page.update({ where: { id: page.id }, data: { title: rev.title, content: tree.ok ? tree.json : "[]" } });
  return { page: updated, undoRevisionId: before.id };
}
