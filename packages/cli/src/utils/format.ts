/**
 * PEZHWAN CLI — output helpers.
 */

export function json(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** Render a narrow aligned table from headers + rows of equal width. */
export function table(headers: string[], rows: Array<Array<string | number>>): string {
  const widths = headers.map((header, i) =>
    Math.max(header.length, ...rows.map((row) => String(row[i] ?? '').length)),
  );
  const rule = (left: string, mid: string, right: string) =>
    `${left}${widths.map((w) => '-'.repeat(w + 2)).join(mid)}${right}`;
  const line = (cells: Array<string | number>) =>
    `| ${cells.map((cell, i) => String(cell).padEnd(widths[i]!)).join(' | ')} |`;
  return [rule('+', '+', '+'), line(headers), rule('+', '=', '+'), ...rows.map(line), rule('+', '+', '+')].join(
    '\n',
  );
}