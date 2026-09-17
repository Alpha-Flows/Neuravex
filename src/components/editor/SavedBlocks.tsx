"use client";
import { useCallback, useEffect, useState } from "react";
import { BaseBlock } from "@/types";
import { getBlockDefinition } from "@/lib/blocks";
import { withFreshIds, cloneTree } from "@/lib/tree-utils";
import { cn } from "@/lib/utils";

export interface SavedBlockRow {
  id: string;
  name: string;
  type: string;
  content: string;
}

interface Props {
  /** Bumped after a save, so the list picks up what was just kept. */
  refreshKey: number;
  onInsert: (block: BaseBlock) => void;
}

/**
 * Blocks someone kept to use again.
 *
 * A section built on one page had to be rebuilt by hand on the next: there was
 * no way to save anything for reuse. These are saved by hand from the
 * inspector and offered here, on every page of every site.
 */
export function SavedBlocks({ refreshKey, onInsert }: Props) {
  const [rows, setRows] = useState<SavedBlockRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/saved-blocks")
      .then((r) => r.json())
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(load, [load, refreshKey]);

  function insert(row: SavedBlockRow) {
    try {
      const parsed = JSON.parse(row.content);
      // Fresh ids: the same saved block may already be on this page.
      onInsert(withFreshIds(cloneTree(parsed)));
    } catch {
      /* A damaged entry is not worth crashing the editor over. */
    }
  }

  async function forget(row: SavedBlockRow) {
    setBusy(row.id);
    try {
      await fetch(`/api/saved-blocks/${row.id}`, { method: "DELETE" });
      setRows((all) => all.filter((r) => r.id !== row.id));
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="px-3 pb-3 pt-1">
        <div className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium px-1 mb-1.5">Saved</div>
        <p className="text-[11px] text-fg-subtle leading-relaxed px-1">
          Select a block and choose <strong className="font-medium">Save for reuse</strong> to keep it here, ready
          for any page.
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 pb-3 pt-1">
      <div className="text-[11px] uppercase tracking-wider text-fg-subtle font-medium px-1 mb-1.5">Saved</div>
      <div className="space-y-1">
        {rows.map((row) => (
          <div
            key={row.id}
            className={cn(
              "group flex items-center gap-2 rounded-md border border-bg-border bg-bg px-2 py-1.5",
              busy === row.id && "opacity-50",
            )}
          >
            <button
              onClick={() => insert(row)}
              className="flex-1 flex items-center gap-2 text-left min-w-0"
              aria-label={`Insert ${row.name}`}
            >
              <span aria-hidden className="text-[11px] font-mono text-fg-muted shrink-0">
                {getBlockDefinition(row.type as never)?.icon ?? "▫"}
              </span>
              <span className="text-[12px] text-fg truncate">{row.name}</span>
            </button>
            <button
              onClick={() => forget(row)}
              aria-label={`Remove ${row.name}`}
              className="text-fg-subtle hover:text-red-400 text-xs opacity-0 group-hover:opacity-100 shrink-0"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
