// The grid of a `TableView` (SDL-633) as the properties panel edits it.
//
// The stored shape is the engine's `TableViewProps.rows`: an array of rows,
// each an array of cell strings, the first row the header when `header` is
// on. Rows may be ragged in a stored document (the renderer pads them); every
// edit here writes a RECTANGULAR grid back, as wide as the widest row, so a
// column is one index across all rows. Pure functions — the input is never
// mutated — within the schema's caps: 1–12 columns, 1–100 rows.

export type TableGrid = string[][];

export const TABLE_MAX_COLUMNS = 12;
export const TABLE_MAX_ROWS = 100;

/** Any stored value → a rectangular grid of strings (at least 1×1). */
export function readTableGrid(value: unknown): TableGrid {
  const rows = Array.isArray(value)
    ? value.map((r) => (Array.isArray(r) ? r.map((c) => (typeof c === "string" ? c : c == null ? "" : String(c))) : []))
    : [];
  const width = Math.max(1, ...rows.map((r) => r.length));
  const grid = rows.length ? rows : [[""]];
  return grid.map((r) => [...r, ...Array.from({ length: width - r.length }, () => "")]);
}

export const tableWidth = (grid: TableGrid): number => grid[0]?.length ?? 0;

export function setTableCell(grid: TableGrid, row: number, col: number, text: string): TableGrid {
  return grid.map((r, i) => (i === row ? r.map((c, j) => (j === col ? text : c)) : [...r]));
}

export function addTableColumn(grid: TableGrid): TableGrid {
  if (tableWidth(grid) >= TABLE_MAX_COLUMNS) return grid;
  return grid.map((r) => [...r, ""]);
}

export function removeTableColumn(grid: TableGrid, col: number): TableGrid {
  if (tableWidth(grid) <= 1 || col < 0 || col >= tableWidth(grid)) return grid;
  return grid.map((r) => r.filter((_, j) => j !== col));
}

export function moveTableColumn(grid: TableGrid, from: number, to: number): TableGrid {
  const w = tableWidth(grid);
  if (from === to || from < 0 || to < 0 || from >= w || to >= w) return grid;
  return grid.map((r) => {
    const next = [...r];
    const [cell] = next.splice(from, 1);
    next.splice(to, 0, cell ?? "");
    return next;
  });
}

export function addTableRow(grid: TableGrid): TableGrid {
  if (grid.length >= TABLE_MAX_ROWS) return grid;
  return [...grid.map((r) => [...r]), Array.from({ length: Math.max(1, tableWidth(grid)) }, () => "")];
}

export function removeTableRow(grid: TableGrid, row: number): TableGrid {
  if (grid.length <= 1 || row < 0 || row >= grid.length) return grid;
  return grid.filter((_, i) => i !== row).map((r) => [...r]);
}

export function moveTableRow(grid: TableGrid, from: number, to: number): TableGrid {
  if (from === to || from < 0 || to < 0 || from >= grid.length || to >= grid.length) return grid;
  const next = grid.map((r) => [...r]);
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row!);
  return next;
}
