/**
 * What changed between two versions of a page, in words.
 *
 * The history offered a preview of an old version and nothing else, so
 * deciding whether to restore one meant looking from the preview to the page
 * and back for whatever was different — a changed phone number in a footer
 * column, a paragraph taken out three sections down. This lists it: blocks
 * added, taken out, changed and moved, each named the way the palette names
 * it with a few words of what it says.
 *
 * Blocks are matched by id, which the editor keeps for as long as a block
 * exists, so a paragraph edited in place reads as changed rather than as one
 * taken out and another put in. Pure, and free of anything server-side: the
 * editor works it out from the version and the canvas.
 */
import type { BaseBlock } from "@/types";
import { getBlockDefinition } from "./blocks";

export type ChangeKind = "title" | "added" | "removed" | "changed" | "moved";

export interface PageChange {
  kind: ChangeKind;
  /** What the block is: "Heading", "Image". The page title's change has "Title". */
  label: string;
  /** A few words of the block as it was, and as it is. */
  before?: string;
  after?: string;
}

interface Placed {
  block: BaseBlock;
  parent: string;
  index: number;
}

function flatten(blocks: BaseBlock[]): Map<string, Placed> {
  const out = new Map<string, Placed>();
  const walk = (list: BaseBlock[], parent: string) =>
    list.forEach((block, index) => {
      out.set(block.id, { block, parent, index });
      if (block.children) walk(block.children, block.id);
    });
  walk(blocks, "page");
  return out;
}

function plain(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim()
    : "";
}

/** A few words of what a block says, or of what it shows. */
export function blockSummary(block: BaseBlock): string {
  const p = (block.props ?? {}) as Record<string, unknown>;
  for (const key of ["text", "title", "label", "question", "caption", "name", "code", "html"]) {
    const words = plain(p[key]);
    if (words) return words.length > 60 ? `${words.slice(0, 59)}…` : words;
  }
  if (typeof p.src === "string" && p.src) return p.src.split("/").pop() ?? "";
  for (const key of ["items", "images", "slides", "plans", "fields", "links", "rows"]) {
    if (Array.isArray(p[key])) return `${(p[key] as unknown[]).length} ${key}`;
  }
  return "";
}

function labelOf(block: BaseBlock): string {
  return getBlockDefinition(block.type)?.label ?? block.type;
}

/** A block's own settings — not its children, which are compared as blocks of their own. */
function ownState(block: BaseBlock): string {
  return JSON.stringify([block.type, block.props, block.box ?? null, block.motion ?? null, block.layer ?? null, block.synced ?? null]);
}

/**
 * The indices that stay put when a list is reordered: the longest run of
 * positions that still increase. Everything else in it was moved.
 */
function staying(positions: number[]): Set<number> {
  const tails: number[] = [];
  const tailAt: number[] = [];
  const prev: number[] = new Array(positions.length).fill(-1);
  positions.forEach((value, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = value;
    tailAt[lo] = i;
    prev[i] = lo > 0 ? tailAt[lo - 1] : -1;
  });
  const out = new Set<number>();
  let at = tails.length ? tailAt[tails.length - 1] : -1;
  while (at !== -1) {
    out.add(at);
    at = prev[at];
  }
  return out;
}

/**
 * What it would take to go from `before` to `after`, in page order of
 * `after`, with what was taken out at the end.
 */
export function diffPages(
  before: { title: string; blocks: BaseBlock[] },
  after: { title: string; blocks: BaseBlock[] },
): PageChange[] {
  const out: PageChange[] = [];
  if (before.title.trim() !== after.title.trim()) out.push({ kind: "title", label: "Title", before: before.title, after: after.title });

  const was = flatten(before.blocks);
  const now = flatten(after.blocks);

  // Moved: into another container, or out of order among the blocks the
  // container had both times.
  const moved = new Set<string>();
  const byParent = new Map<string, string[]>();
  for (const [id, placed] of now) {
    const old = was.get(id);
    if (!old) continue;
    if (old.parent !== placed.parent) {
      moved.add(id);
      continue;
    }
    byParent.set(placed.parent, [...(byParent.get(placed.parent) ?? []), id]);
  }
  for (const ids of byParent.values()) {
    const ordered = ids.sort((a, b) => now.get(a)!.index - now.get(b)!.index);
    const kept = staying(ordered.map((id) => was.get(id)!.index));
    ordered.forEach((id, i) => {
      if (!kept.has(i)) moved.add(id);
    });
  }

  for (const [id, placed] of now) {
    const old = was.get(id);
    const label = labelOf(placed.block);
    if (!old) {
      out.push({ kind: "added", label, after: blockSummary(placed.block) });
      continue;
    }
    if (ownState(old.block) !== ownState(placed.block)) {
      out.push({ kind: "changed", label, before: blockSummary(old.block), after: blockSummary(placed.block) });
    }
    if (moved.has(id)) out.push({ kind: "moved", label, after: blockSummary(placed.block) });
  }
  for (const [id, placed] of was) {
    // A block inside one that was taken out went with it, and is not news.
    if (!now.has(id) && (placed.parent === "page" || now.has(placed.parent))) {
      out.push({ kind: "removed", label: labelOf(placed.block), before: blockSummary(placed.block) });
    }
  }
  return out;
}
