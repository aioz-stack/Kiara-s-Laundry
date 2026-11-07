/**
 * CSV writing. Text cells that a spreadsheet would run as a formula are prefixed
 * with an apostrophe, because customer names and notes are user-supplied.
 * Numbers are passed as numbers and left alone, so negatives stay numeric.
 */
export type CsvCell = string | number | null | undefined;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") return String(cell);
  const safe = FORMULA_PREFIX.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}
