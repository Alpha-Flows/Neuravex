import { describe, it, expect } from "vitest";
import { normalizeBlockTree, safeProps, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS } from "@/lib/block-tree";
import { getBlockDefinition } from "@/lib/blocks";
import {
  addColumn,
  addRow,
  canAddColumn,
  canAddRow,
  removeColumn,
  removeRow,
  setCell,
  showsCaption,
  tableWidth,
  toGrid,
} from "@/lib/table-grid";
import { editedText, hasFormatting, plainText } from "@/lib/inline-text";
import type { TableProps } from "@/types";

/** One table block through the validator every write path uses. */
function table(props: unknown): TableProps {
  const result = normalizeBlockTree([{ id: "t", type: "table", props }]);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  expect(result.tree).toHaveLength(1);
  return result.tree[0].props as TableProps;
}

describe("a table block, as stored", () => {
  it("keeps the palette's default exactly as it is", () => {
    const defaults = getBlockDefinition("table")!.defaultProps;
    expect(table(defaults)).toEqual(defaults);
  });

  it("keeps ragged rows the lengths they arrived", () => {
    // Padding is the renderer's job. Storing it here would invent cells, and
    // a later edit could not tell them from ones somebody left empty.
    const rows = [["Size", "Price", "Note"], ["Small", "2.50"], ["Large"]];
    expect(table({ rows }).rows).toEqual(rows);
  });

  it("cuts rows and columns off at the limits rather than refusing the table", () => {
    const wide = Array.from({ length: MAX_TABLE_COLUMNS + 5 }, (_, c) => `c${c}`);
    const tall = Array.from({ length: MAX_TABLE_ROWS + 50 }, (_, r) => [`r${r}`, ...wide.slice(1)]);
    const stored = table({ rows: tall }).rows;
    expect(stored).toHaveLength(MAX_TABLE_ROWS);
    expect(stored.every((row) => row.length === MAX_TABLE_COLUMNS)).toBe(true);
    // The first rows and columns are the ones kept, not an arbitrary slice.
    expect(stored[0][0]).toBe("r0");
    expect(stored[MAX_TABLE_ROWS - 1][0]).toBe(`r${MAX_TABLE_ROWS - 1}`);
    expect(stored[0][MAX_TABLE_COLUMNS - 1]).toBe(`c${MAX_TABLE_COLUMNS - 1}`);
  });

  it("strips a script and a javascript: link out of a cell and keeps the words", () => {
    const stored = table({
      rows: [
        ["<script>alert(1)</script>Monday", '<a href="javascript:alert(1)">Book</a>'],
        ['<img src=x onerror="alert(1)">Tuesday', '<b onclick="alert(1)">Closed</b>'],
      ],
      caption: '<script>steal()</script><a href="javascript:void(0)">Hours</a>',
    });
    const all = [...stored.rows.flat(), stored.caption].join(" ");
    expect(all).not.toMatch(/<script|javascript:|onerror|onclick|<img/i);
    expect(stored.rows[0][0]).toBe("Monday");
    expect(stored.rows[1][1]).toBe("<b>Closed</b>");
    expect(plainText(stored.rows[0][1])).toBe("Book");
    expect(plainText(stored.caption)).toBe("Hours");
  });

  it("keeps a safe link and a line of formatting in a cell", () => {
    const stored = table({ rows: [['<a href="https://example.com/menu">Menu</a> <em>new</em>']] });
    expect(stored.rows[0][0]).toBe('<a href="https://example.com/menu">Menu</a> <em>new</em>');
  });

  it("drops a row that is not a list, and reads a bare string as a row of one", () => {
    const stored = table({ rows: [["A", "B"], null, 7, { a: 1 }, "Just a note", ["C", "D"]] });
    expect(stored.rows).toEqual([["A", "B"], ["Just a note"], ["C", "D"]]);
  });

  it("never drops a cell, so the cells after it stay in their columns", () => {
    const stored = table({ rows: [["Espresso", null, { x: 1 }, "2.40"], ["Latte", 3.1, undefined, true]] });
    expect(stored.rows).toEqual([
      ["Espresso", "", "", "2.40"],
      ["Latte", "3.1", "", ""],
    ]);
  });

  it("repairs rows that are not a list at all, and flags that are not flags", () => {
    const stored = table({ rows: "Monday, Tuesday", headerRow: "yes", headerColumn: 1, striped: null, caption: 42 });
    expect(stored).toEqual({ rows: [], headerRow: true, headerColumn: false, striped: true, caption: "" });
  });

  it("repairs a stored row at render too, for rows written before the validator", () => {
    const props = safeProps<TableProps>("table", { rows: [["ok"], "loose", null] }, {} as TableProps);
    expect(props.rows).toEqual([["ok"], ["loose"]]);
  });
});

describe("the grid a table is drawn and edited as", () => {
  it("pads ragged rows to the widest one with empty cells", () => {
    expect(toGrid([["a", "b", "c"], ["d"], []])).toEqual([
      ["a", "b", "c"],
      ["d", "", ""],
      ["", "", ""],
    ]);
    expect(tableWidth([["a"], ["b", "c", "d"]])).toBe(3);
  });

  it("always has at least one cell to click into", () => {
    expect(toGrid([])).toEqual([[""]]);
    expect(toGrid(undefined)).toEqual([[""]]);
    expect(toGrid([[], []])).toEqual([[""], [""]]);
  });

  it("leaves out what the validator would, without throwing", () => {
    expect(toGrid([["a", 5, null], "loose", null, ["b"]])).toEqual([
      ["a", "", ""],
      ["b", "", ""],
    ]);
  });

  it("changes one cell and leaves the rest alone", () => {
    const grid = [["a", "b"], ["c"]];
    expect(setCell(grid, 1, 1, "d")).toEqual([["a", "b"], ["c", "d"]]);
    // Out of range is a no-op, not a new row.
    expect(setCell(grid, 5, 0, "x")).toEqual([["a", "b"], ["c", ""]]);
    // The input is not changed underneath its owner.
    expect(grid).toEqual([["a", "b"], ["c"]]);
  });

  it("adds a row at the end, or before a given row", () => {
    const grid = [["h1", "h2"], ["a", "b"]];
    expect(addRow(grid)).toEqual([["h1", "h2"], ["a", "b"], ["", ""]]);
    expect(addRow(grid, 1)).toEqual([["h1", "h2"], ["", ""], ["a", "b"]]);
    expect(addRow(grid, 0)).toEqual([["", ""], ["h1", "h2"], ["a", "b"]]);
    expect(addRow(grid, 99)).toEqual(addRow(grid));
    expect(addRow(grid, -3)).toEqual(addRow(grid, 0));
  });

  it("adds a column at the end, or before a given column, in every row", () => {
    const grid = [["a", "b"], ["c"]];
    expect(addColumn(grid)).toEqual([["a", "b", ""], ["c", "", ""]]);
    expect(addColumn(grid, 1)).toEqual([["a", "", "b"], ["c", "", ""]]);
    expect(addColumn(grid, 0)).toEqual([["", "a", "b"], ["", "c", ""]]);
  });

  it("removes a row or a column, but never the last one", () => {
    const grid = [["a", "b"], ["c", "d"], ["e", "f"]];
    expect(removeRow(grid, 1)).toEqual([["a", "b"], ["e", "f"]]);
    expect(removeColumn(grid, 0)).toEqual([["b"], ["d"], ["f"]]);
    expect(removeRow([["only", "row"]], 0)).toEqual([["only", "row"]]);
    expect(removeColumn([["only"], ["column"]], 0)).toEqual([["only"], ["column"]]);
    expect(removeRow(grid, 7)).toEqual(grid);
    expect(removeColumn(grid, -1)).toEqual(grid);
  });

  it("stops adding at the limits the validator enforces", () => {
    const full = Array.from({ length: MAX_TABLE_ROWS }, () => Array.from({ length: MAX_TABLE_COLUMNS }, () => "x"));
    expect(canAddRow(full)).toBe(false);
    expect(canAddColumn(full)).toBe(false);
    expect(addRow(full)).toHaveLength(MAX_TABLE_ROWS);
    expect(addColumn(full)[0]).toHaveLength(MAX_TABLE_COLUMNS);
    expect(canAddRow([["a"]])).toBe(true);
    expect(canAddColumn([["a"]])).toBe(true);
    // A grid built from rows past the limit is cut to it, so an edit never
    // produces something the next save would quietly shorten.
    const over = Array.from({ length: MAX_TABLE_ROWS + 3 }, () => Array.from({ length: MAX_TABLE_COLUMNS + 3 }, () => "x"));
    const grid = toGrid(over);
    expect(grid).toHaveLength(MAX_TABLE_ROWS);
    expect(grid[0]).toHaveLength(MAX_TABLE_COLUMNS);
  });

  it("gives back a grid the validator stores unchanged", () => {
    const edited = removeColumn(addRow(addColumn(setCell([["Day", "Hours"], ["Mon"]], 1, 1, "9 – 5"), 1), 1), 2);
    expect(table({ rows: edited }).rows).toEqual(edited);
  });
});

describe("a cell in the panel's text box", () => {
  it("shows the words, not the markup", () => {
    expect(plainText("<b>Closed</b> on Sunday")).toBe("Closed on Sunday");
    expect(plainText("Fish &amp; chips &lt;5 kg")).toBe("Fish & chips <5 kg");
  });

  it("stores typed words as text, and they survive the validator as typed", () => {
    for (const typed of ["Fish & chips", "<5 kg", "<script>alert(1)</script> & <b>", "Café"]) {
      const stored = table({ rows: [[editedText("", typed)]] }).rows[0][0];
      expect(stored).not.toMatch(/<script|<b>/);
      expect(plainText(stored)).toBe(typed);
    }
  });

  it("keeps a formatted cell's markup until its words are changed", () => {
    expect(editedText("<b>Closed</b>", "Closed")).toBe("<b>Closed</b>");
    expect(editedText("<b>Closed</b>", "Closed all day")).toBe("Closed all day");
    expect(hasFormatting("<em>new</em>")).toBe(true);
    expect(hasFormatting("5 &lt; 6")).toBe(false);
  });
});

describe("the caption on the canvas", () => {
  it("is drawn when it says something, and not when it is empty", () => {
    expect(showsCaption("Opening hours", false)).toBe(true);
    expect(showsCaption("", false)).toBe(false);
    expect(showsCaption("  <br> &nbsp;", false)).toBe(false);
    expect(showsCaption(undefined, false)).toBe(false);
  });

  it("stays while somebody is typing in it, however empty they have made it", () => {
    // Taking it away on the keystroke that emptied it dropped the caret to the
    // document, and the next Backspace deleted the whole table.
    expect(showsCaption("", true)).toBe(true);
    expect(showsCaption("<br>", true)).toBe(true);
  });
});
