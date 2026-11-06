/**
 * CSV encoding that neutralises spreadsheet formula injection: any cell starting with
 * = + - @ TAB or CR is prefixed with a single quote, and every cell is quoted.
 */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value);
  const plainNumber = /^-?\d+(\.\d+)?$/.test(s);
  if (!plainNumber && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  // BOM so spreadsheet apps detect UTF-8 (Hindi text), CRLF per RFC 4180.
  return '﻿' + [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
