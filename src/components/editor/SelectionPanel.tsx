"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { ContainerChoice } from "@/lib/containers";

/**
 * What can be done to several blocks at once, in the place the inspector
 * usually is: see `lib/multi-select`. Shown once a second block has been
 * added to the choice with Shift or ⌘/Ctrl held.
 */
export function SelectionPanel({
  count,
  labels,
  canWrap,
  targets,
  onWrap,
  onMove,
  onDelete,
  onClear,
}: {
  count: number;
  /** What each chosen block is, in page order, for the list. */
  labels: string[];
  /** Whether the blocks share a container, which wrapping them needs. */
  canWrap: boolean;
  /** Where they could be moved together. */
  targets: ContainerChoice[];
  onWrap: () => void;
  onMove: (target: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const [target, setTarget] = useState("");

  return (
    <aside data-inspector="" data-selection-panel="" className="w-72 shrink-0 border-l border-bg-border bg-bg-soft h-full overflow-y-auto p-4 space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide text-fg-muted font-semibold">{count} blocks chosen</div>
          <button type="button" onClick={onClear} className="text-xs text-fg-muted hover:text-fg underline">
            Clear
          </button>
        </div>
        <ol className="text-xs text-fg-muted space-y-0.5 list-decimal list-inside">
          {labels.map((label, i) => (
            <li key={i} className="truncate">{label}</li>
          ))}
        </ol>
        <p className="text-[11px] text-fg-subtle mt-2">Shift- or ⌘/Ctrl-click a block to add it or take it out.</p>
      </div>

      <div className="space-y-1.5">
        <Button size="sm" variant="outline" className="w-full" onClick={onWrap} disabled={!canWrap}>
          Put them in a section
        </Button>
        {canWrap ? null : (
          <p className="text-[11px] text-fg-subtle">They are in different places on the page, so there is no one place for the section.</p>
        )}
      </div>

      {targets.length > 0 ? (
        <div className="space-y-1.5">
          <label htmlFor="selection-move" className="block text-xs text-fg-muted">Move them to</label>
          <div className="flex gap-2">
            <select
              id="selection-move"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-9 w-full px-2 rounded-md bg-bg border border-bg-border text-fg text-sm focus:outline-none focus:border-brand/60"
            >
              <option value="">Choose where</option>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {"  ".repeat(t.depth)}{t.label}
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" disabled={!target} onClick={() => { onMove(target); setTarget(""); }} className="shrink-0">
              Move
            </Button>
          </div>
          <p className="text-[11px] text-fg-subtle">They go to the end of it, in the order they are on the page.</p>
        </div>
      ) : null}

      <Button size="sm" variant="danger" className="w-full" onClick={onDelete}>
        Delete {count} blocks
      </Button>
    </aside>
  );
}
