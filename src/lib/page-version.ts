/**
 * Which version of a page an editor is looking at, and what to do when it is
 * not the newest.
 *
 * Two editors on one page — two tabs, a second window, the MCP agent writing
 * the page while somebody had it open — overwrote each other without a word.
 * Every save sends the whole page, so whichever saved last won, and whatever
 * the other had done since opening it was gone, with the status line of both
 * saying "Saved". A rename elsewhere moving this page's links was lost the
 * same way.
 *
 * So an editor says which version it started from, and a save made against
 * one that has since been replaced is refused rather than written. What the
 * editor then offers — the newer version, or its own over the top — is the
 * author's choice, and either way nothing is lost: see `keepAsVersion`.
 *
 * The version is a fingerprint of what an editor writes — the title, the
 * address, the settings and the blocks — rather than the time the row was
 * last written, which it was at first. Too much moves that time. A synced
 * block edited on another page is written into this one's copy, and the
 * editor already brings its copy up to date on its next save; reordering the
 * pages on the dashboard writes a sort position no editor sends; linking a
 * translation writes a group no editor sends either. Each of those turned an
 * author's next save into "changed somewhere else" when nothing they could
 * lose had changed. So the copies of synced blocks are counted by where they
 * are and not by what they say, and only what a stale save would put back
 * is counted at all.
 */
import { createHash } from "crypto";
import type { Page } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeBlockTree } from "./block-tree";

/** The fields every editor save sends, and so the ones a stale save would write back. */
export const VERSION_SELECT = {
  title: true,
  slug: true,
  content: true,
  published: true,
  isHome: true,
  isNotFound: true,
  metaTitle: true,
  metaDescription: true,
  ogImage: true,
  language: true,
  isPost: true,
  postDate: true,
  author: true,
  excerpt: true,
  coverImage: true,
  tags: true,
} as const;

export type VersionedPage = Pick<Page, keyof typeof VERSION_SELECT>;

/** The block tree with each synced copy reduced to where it is; see `settleSyncedBlocks`. */
function placesOfSyncedCopies(content: string): unknown {
  let tree: unknown;
  try {
    tree = JSON.parse(content || "[]");
  } catch {
    return content;
  }
  const walk = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map((block) => {
          if (!block || typeof block !== "object") return block;
          const b = block as Record<string, unknown>;
          if (typeof b.synced === "string") return { id: b.id, synced: b.synced, layer: b.layer ?? null, column: b.column ?? null };
          return Array.isArray(b.children) ? { ...b, children: walk(b.children) } : b;
        })
      : value;
  return walk(tree);
}

/** A page's version, as an editor holds it. */
export function versionOf(page: VersionedPage): string {
  const fields = (Object.keys(VERSION_SELECT) as (keyof VersionedPage)[]).map((key) => {
    const value = page[key];
    if (key === "content") return placesOfSyncedCopies(typeof value === "string" ? value : "[]");
    return value instanceof Date ? value.toISOString() : (value ?? null);
  });
  return createHash("sha256").update(JSON.stringify(fields)).digest("base64url").slice(0, 32);
}

/** True when `base` names a version and it is not the page's. An editor that names none is not checked. */
export function isStale(page: VersionedPage, base: unknown): boolean {
  return typeof base === "string" && base !== "" && base !== versionOf(page);
}

/** The page's version now, or null when there is no such page. */
export async function currentVersion(pageId: string): Promise<string | null> {
  const page = await prisma.page.findUnique({ where: { id: pageId }, select: VERSION_SELECT });
  return page ? versionOf(page) : null;
}

/**
 * A version of the page kept in its history under a name, without touching
 * the page: the one that is about to be written over, or the one an editor
 * is about to let go of. Content that is not a block tree is not kept.
 */
export async function keepAsVersion(
  pageId: string,
  { title, content, name }: { title: string; content: unknown; name: string },
): Promise<boolean> {
  const tree = normalizeBlockTree(typeof content === "string" ? content : content ?? []);
  if (!tree.ok) return false;
  await prisma.revision.create({
    data: { pageId, title: title.trim().slice(0, 300) || "Untitled", content: JSON.stringify(tree.tree), manual: true, name: name.slice(0, 120) },
  });
  return true;
}
