/**
 * Minimal RFC 4180 CSV serialization, safe for spreadsheet apps.
 *
 * - Fields containing a comma, quote, CR or LF are wrapped in double quotes,
 *   with embedded quotes doubled.
 * - Formula-injection guard: a field beginning with = + - @ (or a leading tab /
 *   CR, which some parsers strip) is prefixed with a single quote so Excel /
 *   Sheets treat it as text, never a formula.
 * - null / undefined become empty strings.
 */
const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (FORMULA_PREFIX.test(s)) s = `'${s}`;
  if (NEEDS_QUOTING.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a CSV string from a header row and data rows (CRLF line endings). */
export function rowsToCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\r\n");
}
