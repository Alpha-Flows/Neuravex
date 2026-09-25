"use client";
import { useEffect, useRef, useState } from "react";
import type { TableProps } from "@/types";
import { cn } from "@/lib/utils";
import { domId } from "@/lib/dom-id";
import { TOKEN } from "@/lib/site-theme";
import {
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  addColumn,
  addRow,
  canAddColumn,
  canAddRow,
  setCell,
  showsCaption,
  toGrid,
} from "@/lib/table-grid";
import { isBlank } from "@/lib/inline-text";
import { Editable } from "./Editable";

interface Props {
  props: TableProps;
  onChange?: (next: TableProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

/**
 * Rows and columns: opening hours, a price list, a spec sheet.
 *
 * A real `<table>`, because a grid of `<div>`s reads out to a screen reader
 * as one long run of words — "Saturday 10:00 – 14:00 Sunday Closed" — with
 * nothing to say which heading a cell sits under. With a header row the first
 * row is a `<thead>` of column headings, and with a header column each row's
 * first cell names the row, so a screen reader can announce a cell as
 * "Saturday, Hours, 10:00 – 14:00".
 *
 * A table does not wrap the way a paragraph does. Eight columns in the narrow
 * half of a Columns block are wider than the room they are given however far
 * each cell wraps, and a table left to itself then runs out past its column
 * and over the neighbour. So the table sits in a frame that scrolls sideways
 * when it is wider than the room it was given. That frame is a named region a
 * keyboard can reach — a scrolling box nobody can focus is a box a keyboard
 * user can only see the first half of — and it is named by the caption when
 * there is one.
 *
 * Nothing here needs a script: scrolling is the browser's own, and the stripes
 * and header fill are CSS in the `table` region of globals.css, mixed from the
 * text colour so the same table reads on a white page and in a dark section.
 */
export function TableBlock({ props, onChange, disabled, blockId }: Props) {
  const grid = toGrid(props.rows);
  const editing = !disabled && !!onChange;
  const tableRef = useRef<HTMLTableElement>(null);
  // The cell to put the caret in once the row or column just added exists.
  // A ref rather than state: it is read once, after the commit that drew the
  // new cell, and nothing about the render depends on it.
  const focusNext = useRef<{ row: number; column: number } | null>(null);

  useEffect(() => {
    const want = focusNext.current;
    if (!want) return;
    focusNext.current = null;
    const cell = tableRef.current?.rows[want.row]?.cells[want.column];
    cell?.querySelector<HTMLElement>("[contenteditable]")?.focus();
  });

  // Whether the caret is in the caption, so emptying it does not take it off
  // the canvas while it is being typed in — see `showsCaption`.
  const [captionFocused, setCaptionFocused] = useState(false);

  const captionId = domId(blockId, "caption");
  // The region is named by the caption only when the caption says something;
  // one that is empty while it is being typed in names nothing.
  const hasCaption = !isBlank(props.caption);
  const drawCaption = showsCaption(props.caption, editing && captionFocused);
  const head = props.headerRow ? grid[0] : null;
  const body = props.headerRow ? grid.slice(1) : grid;

  function cell(value: string, row: number, column: number) {
    return (
      <Editable
        className="nvx-table-cell"
        disabled={!editing}
        value={value}
        onChange={(v) => onChange?.({ ...props, rows: setCell(grid, row, column, v) })}
      />
    );
  }

  // Body rows are counted from the top of the whole table, so a cell's row
  // index is the same one `setCell` and `table.rows` use.
  const bodyOffset = props.headerRow ? 1 : 0;

  return (
    <div className={cn("nvx-table relative", props.striped && "nvx-table--striped")}>
      <div
        className="nvx-table-scroll"
        role="region"
        tabIndex={0}
        aria-labelledby={hasCaption ? captionId : undefined}
        aria-label={hasCaption ? undefined : "Table"}
        style={{ borderRadius: TOKEN.radius("0.5rem") }}
      >
        <table ref={tableRef} className="nvx-table-grid">
          {drawCaption ? (
            <caption
              id={captionId}
              onFocus={() => setCaptionFocused(true)}
              onBlur={(e) => {
                // The formatting toolbar's link field takes focus while a
                // link is typed; the caption is still the thing being edited.
                const to = e.relatedTarget as HTMLElement | null;
                if (!to?.closest?.("[data-formatting-toolbar]")) setCaptionFocused(false);
              }}
            >
              <Editable
                as="span"
                disabled={!editing}
                value={props.caption}
                onChange={(caption) => onChange?.({ ...props, caption })}
              />
            </caption>
          ) : null}
          {head ? (
            <thead>
              <tr>
                {head.map((value, c) => (
                  <th key={c} scope="col">{cell(value, 0, c)}</th>
                ))}
              </tr>
            </thead>
          ) : null}
          {body.length > 0 ? (
            <tbody>
              {body.map((cells, i) => {
                const r = i + bodyOffset;
                return (
                  <tr key={r}>
                    {cells.map((value, c) =>
                      props.headerColumn && c === 0 ? (
                        <th key={c} scope="row">{cell(value, r, c)}</th>
                      ) : (
                        <td key={c}>{cell(value, r, c)}</td>
                      ),
                    )}
                  </tr>
                );
              })}
            </tbody>
          ) : null}
        </table>
      </div>
      {editing ? (
        // Over the block rather than in the flow, where these would push the
        // page down on the canvas and nowhere else — and inside the frame
        // rather than hanging off it, because every edge outside it belonged
        // to something else. Below the last row, like the list's "Add item",
        // a Columns cell painted the next block on the page over them, so
        // they could be seen and not clicked. Above the first row, the first
        // table on a page had them under the site's header, and every other
        // table laid them over the bottom of the block above, where a click
        // meant for that block's text added a row to this one. In the
        // bottom-right corner they cover only the end of the last row, which
        // is the part of a table whose text starts on the left most likely
        // to be empty.
        <div className="nvx-block-chrome absolute right-1.5 bottom-1.5 z-10 flex items-center gap-3 rounded-md border border-bg-border bg-bg-card/95 px-2 py-1 shadow-lg">
          <button
            type="button"
            disabled={!canAddRow(grid)}
            title={canAddRow(grid) ? undefined : `A table holds up to ${MAX_TABLE_ROWS} rows.`}
            onClick={() => {
              focusNext.current = { row: grid.length, column: 0 };
              onChange?.({ ...props, rows: addRow(grid) });
            }}
            className="whitespace-nowrap text-xs text-fg-muted hover:text-fg disabled:opacity-40"
          >
            + Add row
          </button>
          <button
            type="button"
            disabled={!canAddColumn(grid)}
            title={canAddColumn(grid) ? undefined : `A table holds up to ${MAX_TABLE_COLUMNS} columns.`}
            onClick={() => {
              focusNext.current = { row: 0, column: grid[0].length };
              onChange?.({ ...props, rows: addColumn(grid) });
            }}
            className="whitespace-nowrap text-xs text-fg-muted hover:text-fg disabled:opacity-40"
          >
            + Add column
          </button>
        </div>
      ) : null}
    </div>
  );
}
