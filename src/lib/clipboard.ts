/**
 * Carrying a block from one page to another.
 *
 * There was no way to reuse anything: a section built on one page had to be
 * rebuilt by hand on the next. Copy and paste is the reuse people reach for
 * first, and it has to survive leaving the page — so the block is kept in the
 * browser's own storage rather than in React state, and a copy taken on one
 * page can be pasted on another, or in another tab.
 */

import { BaseBlock } from "@/types";
import { withFreshIds, cloneTree } from "./tree-utils";

const KEY = "neuravex:clipboard";

export interface ClipboardEntry {
  block: BaseBlock;
  /** For the paste hint: "Paste Section". */
  label: string;
  copiedAt: number;
}

/** A block only counts if it still looks like one. */
export function isBlock(value: unknown): value is BaseBlock {
  const b = value as BaseBlock | null;
  return !!b && typeof b === "object" && typeof b.id === "string" && typeof b.type === "string";
}

export function readClipboard(storage?: Storage): ClipboardEntry | null {
  try {
    const store = storage ?? window.localStorage;
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isBlock(parsed?.block)) return null;
    return {
      block: parsed.block,
      label: typeof parsed.label === "string" ? parsed.label : parsed.block.type,
      copiedAt: Number(parsed.copiedAt) || 0,
    };
  } catch {
    // Private windows, cleared storage, a half-written value: all mean the
    // same thing here — there is nothing to paste.
    return null;
  }
}

export function writeClipboard(block: BaseBlock, label: string, storage?: Storage): boolean {
  try {
    const store = storage ?? window.localStorage;
    store.setItem(KEY, JSON.stringify({ block: cloneTree(block), label, copiedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function clearClipboard(storage?: Storage): void {
  try {
    (storage ?? window.localStorage).removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * The block to insert, with ids nothing else is using.
 *
 * Pasting the same copy twice, or pasting into the page it came from, must not
 * produce two blocks that share an id — that breaks selection and dragging for
 * both of them.
 */
export function pasteable(entry: ClipboardEntry): BaseBlock {
  return withFreshIds(cloneTree(entry.block));
}
