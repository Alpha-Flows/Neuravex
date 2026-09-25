import { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS } from "./block-tree";
import { isBlank } from "./inline-text";

/**
 * The shape a table is drawn in, and the edits that keep it that shape.
 *
 * A table's rows are stored the lengths they arrived. The validator keeps a
 * row of two beside a row of five rather than inventing cells nobody wrote,
 * and an import or an agent writing through the MCP server can hand over
 * exactly that. Drawn as stored, a short row stops early: its border and its
 * stripe end in mid-air, the columns after it are holes, and there is no cell
 * there to click into and fill. So everything that draws or edits a table
 * works on a rectangle instead — the widest row decides how many columns
 * there are, and the shorter rows are filled out with empty cells.
 *
 * Every edit keeps at least one row and one column, because a table with
 * neither has nothing left on the canvas to click to put one back. And every
 * edit stays inside the limits `block-tree.ts` enforces: a thirteenth column
 * added here would be cut off by the next save without a word, which is
 * worse than a button that says there is no more room.
 */

export type TableGrid = string[][];

export { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS };

function cellOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** How many columns the widest stored row has, within the limit. */
export function tableWidth(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  let width = 0;
  for (const row of rows.slice(0, MAX_TABLE_ROWS)) {
    if (Array.isArray(row)) width = Math.max(width, Math.min(row.length, MAX_TABLE_COLUMNS));
  }
  return width;
}

/**
 * The stored rows as a rectangle of at least one cell.
 *
 * Takes `unknown` because the canvas can be handed a row the validator has not
 * seen yet — a paste, a revision from before the table existed — and a table
 * that throws while drawing is a gap on the page. A row that is not a list is
 * left out, as the validator would leave it out.
 */
export function toGrid(rows: unknown): TableGrid {
  const source = Array.isArray(rows) ? rows.slice(0, MAX_TABLE_ROWS).filter(Array.isArray) : [];
  const width = Math.max(1, tableWidth(source));
  const grid = source.map((row: unknown[]) =>
    Array.from({ length: width }, (_, c) => cellOf(row[c])),
  );
  return grid.length > 0 ? grid : [Array.from({ length: width }, () => "")];
}

/** Whether another row fits. */
export function canAddRow(rows: unknown): boolean {
  return toGrid(rows).length < MAX_TABLE_ROWS;
}

/** Whether another column fits. */
export function canAddColumn(rows: unknown): boolean {
  return toGrid(rows)[0].length < MAX_TABLE_COLUMNS;
}

const clampIndex = (at: number | undefined, length: number) =>
  at === undefined || !Number.isFinite(at) ? length : Math.min(Math.max(Math.trunc(at), 0), length);

/** One cell changed, the rest of the table as it was. */
export function setCell(rows: unknown, row: number, column: number, value: string): TableGrid {
  const grid = toGrid(rows);
  if (row < 0 || row >= grid.length || column < 0 || column >= grid[0].length) return grid;
  return grid.map((cells, r) => (r === row ? cells.map((cell, c) => (c === column ? value : cell)) : cells));
}

/** An empty row before `at`, or at the end when `at` is left out. */
export function addRow(rows: unknown, at?: number): TableGrid {
  const grid = toGrid(rows);
  if (grid.length >= MAX_TABLE_ROWS) return grid;
  const index = clampIndex(at, grid.length);
  const blank = Array.from({ length: grid[0].length }, () => "");
  return [...grid.slice(0, index), blank, ...grid.slice(index)];
}

/** Every row but the one at `at` — unless it is the last row there is. */
export function removeRow(rows: unknown, at: number): TableGrid {
  const grid = toGrid(rows);
  if (grid.length <= 1 || at < 0 || at >= grid.length) return grid;
  return grid.filter((_, r) => r !== at);
}

/** An empty cell before `at` in every row, or at the end when `at` is left out. */
export function addColumn(rows: unknown, at?: number): TableGrid {
  const grid = toGrid(rows);
  const width = grid[0].length;
  if (width >= MAX_TABLE_COLUMNS) return grid;
  const index = clampIndex(at, width);
  return grid.map((cells) => [...cells.slice(0, index), "", ...cells.slice(index)]);
}

/** Every column but the one at `at` — unless it is the last column there is. */
export function removeColumn(rows: unknown, at: number): TableGrid {
  const grid = toGrid(rows);
  if (grid[0].length <= 1 || at < 0 || at >= grid[0].length) return grid;
  return grid.map((cells) => cells.filter((_, c) => c !== at));
}

/**
 * Whether the caption is drawn.
 *
 * An empty caption is not drawn, because a visitor would see an empty band at
 * the top of the frame. But the caption is edited in place, and on the canvas
 * the keystroke that emptied it used to take it off the page in the middle of
 * being typed in: the caret fell back to the document, the next words went
 * nowhere, and the Backspace after that reached the editor's delete-block
 * shortcut and removed the whole table. So a caption somebody is typing in is
 * drawn however empty it is, and one they have emptied and left is not.
 */
export function showsCaption(caption: unknown, beingEdited: boolean): boolean {
  return beingEdited || !isBlank(caption);
}
