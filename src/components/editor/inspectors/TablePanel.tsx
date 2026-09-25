"use client";
import type { TableProps } from "@/types";
import { Input } from "@/components/ui/Input";
import {
  MAX_TABLE_COLUMNS,
  MAX_TABLE_ROWS,
  addColumn,
  addRow,
  canAddColumn,
  canAddRow,
  removeColumn,
  removeRow,
  setCell,
  toGrid,
} from "@/lib/table-grid";
import { editedText, hasFormatting, plainText } from "@/lib/inline-text";
import { Field, Toggle, type BlockPanelProps } from "../inspector-fields";

/**
 * The table's settings, and a small copy of the table to edit it from.
 *
 * Cells are edited in place on the canvas, which is where most of the typing
 * happens. What the canvas cannot do well is take things away or put them in
 * the middle: a button for each on every row and every column would sit over
 * the text being edited, and a table of twelve rows and six columns would
 * carry thirty-six of them. So the panel holds the grid a second time, a
 * small box per cell, with the buttons at the head of each column and at the
 * start of each row, where each names the row or column it acts on. It
 * scrolls sideways, as the table does, once there are more columns than the
 * rail has room for.
 *
 * Every box shows a cell's words rather than its markup (see `inline-text.ts`),
 * so only a cell somebody retypes here loses the bold or the link it was given
 * on the page — and the panel says so wherever there is any to lose.
 */
export function TablePanel({ block, onChange }: BlockPanelProps) {
  const p = block.props as TableProps;
  const grid = toGrid(p.rows);
  const columns = grid[0].length;
  const set = (patch: Partial<TableProps>) => onChange({ ...block, props: { ...p, ...patch } });
  const formatted = grid.some((row) => row.some(hasFormatting));
  const moreRows = canAddRow(grid);
  const moreColumns = canAddColumn(grid);

  // What a row or a column is called when it is read out: its position, and
  // the words that label it when there are any, so "Remove row 3, Saturday"
  // says which row is about to go.
  const rowName = (r: number) => {
    const label = plainText(grid[r][0]).trim();
    return `row ${r + 1}${label ? `, ${label}` : ""}`;
  };
  const columnName = (c: number) => {
    const label = p.headerRow ? plainText(grid[0][c]).trim() : "";
    return `column ${c + 1}${label ? `, ${label}` : ""}`;
  };

  const smallButton =
    "h-5 w-5 rounded text-xs text-fg-subtle hover:bg-bg-card disabled:opacity-30 disabled:hover:bg-transparent";
  // The pinned column is painted in the rail's colour, and so is a strip to
  // its left: the grid's cells are spaced 4px apart, and without the strip the
  // end of each scrolled-away cell showed through that gap beside the buttons.
  const pinned = "sticky left-0 z-10 bg-bg-soft shadow-[-6px_0_0_0_theme(colors.bg.soft)]";

  return (
    <>
      <Field label="Caption">
        <Input
          value={plainText(p.caption)}
          aria-label="Caption"
          placeholder="Opening hours"
          onChange={(e) => set({ caption: editedText(p.caption, e.target.value) })}
        />
        <p className="text-[11px] text-fg-subtle mt-1">
          {hasFormatting(p.caption)
            ? "The caption has bold, italics or a link, made on the page. Typing into it here keeps its words and drops the formatting."
            : "Shown above the table, and read out as its name. Leave it empty for none."}
        </p>
      </Field>

      <div className="space-y-2">
        <Toggle
          label="First row is headings"
          checked={p.headerRow}
          onChange={(headerRow) => set({ headerRow })}
        />
        <Toggle
          label="First column names each row"
          checked={p.headerColumn}
          onChange={(headerColumn) => set({ headerColumn })}
          hint="For a list of days, products or features down the side."
        />
        <Toggle label="Shade every other row" checked={p.striped} onChange={(striped) => set({ striped })} />
      </div>

      <Field label="Cells">
        <div className="overflow-x-auto -mx-1 px-1 pb-1">
          <table className="border-separate border-spacing-1">
            <thead>
              <tr>
                <td className={pinned} />
                {grid[0].map((_, c) => (
                  <th key={c} scope="col" className="p-0 font-normal">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => set({ rows: addColumn(grid, c) })}
                        disabled={!moreColumns}
                        aria-label={`Insert a column before ${columnName(c)}`}
                        title="Insert a column before this one"
                        className={`${smallButton} hover:text-fg`}
                      >+</button>
                      <button
                        type="button"
                        onClick={() => set({ rows: removeColumn(grid, c) })}
                        disabled={columns <= 1}
                        aria-label={`Remove ${columnName(c)}`}
                        title="Remove this column"
                        className={`${smallButton} hover:text-red-400`}
                      >×</button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, r) => (
                <tr key={r}>
                  {/* Pinned to the left edge, so a row can still be added or
                      removed once the grid has been scrolled along to its last
                      column. */}
                  <th scope="row" className={`${pinned} p-0 font-normal`}>
                    <div className="flex items-center">
                      <button
                        type="button"
                        onClick={() => set({ rows: addRow(grid, r) })}
                        disabled={!moreRows}
                        aria-label={`Insert a row above ${rowName(r)}`}
                        title="Insert a row above this one"
                        className={`${smallButton} hover:text-fg`}
                      >+</button>
                      <button
                        type="button"
                        onClick={() => set({ rows: removeRow(grid, r) })}
                        disabled={grid.length <= 1}
                        aria-label={`Remove ${rowName(r)}`}
                        title="Remove this row"
                        className={`${smallButton} hover:text-red-400`}
                      >×</button>
                    </div>
                  </th>
                  {row.map((value, c) => (
                    <td key={c} className="p-0">
                      <input
                        value={plainText(value)}
                        onChange={(e) => set({ rows: setCell(grid, r, c, editedText(value, e.target.value)) })}
                        aria-label={`Row ${r + 1}, column ${c + 1}`}
                        className={
                          "h-7 w-[6.5rem] px-1.5 rounded bg-bg border border-bg-border text-fg text-xs " +
                          "focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/60 " +
                          ((p.headerRow && r === 0) || (p.headerColumn && c === 0) ? "font-semibold" : "")
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
          {moreRows ? (
            <button
              type="button"
              onClick={() => set({ rows: addRow(grid) })}
              className="whitespace-nowrap text-xs text-fg-muted hover:text-fg"
            >
              + Add row
            </button>
          ) : (
            <span className="text-[11px] text-fg-subtle">{MAX_TABLE_ROWS} rows is as many as a table holds.</span>
          )}
          {moreColumns ? (
            <button
              type="button"
              onClick={() => set({ rows: addColumn(grid) })}
              className="whitespace-nowrap text-xs text-fg-muted hover:text-fg"
            >
              + Add column
            </button>
          ) : (
            <span className="text-[11px] text-fg-subtle">{MAX_TABLE_COLUMNS} columns is as many as a table holds.</span>
          )}
        </div>
        <p className="text-[11px] text-fg-subtle mt-2">
          {formatted
            ? "Some cells have bold, italics or a link, made on the page. Typing into one of those here keeps its words and drops the formatting."
            : "Cells can be typed into on the page too, where selecting words gives you bold, italics and links."}
        </p>
      </Field>
    </>
  );
}
