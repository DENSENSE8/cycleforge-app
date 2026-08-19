/**
 * The ONE CSV reader for table import.
 *
 * Dependency-free: quoted fields, escaped `""`, `\n` / `\r\n`, and a leading
 * BOM. Lives in the import seam rather than beside any one family so a second
 * surface taking a file never has a reason to hand-roll a second parser.
 *
 * Delimiter: comma by default; Amazon Seller Central returns reports are often
 * tab-separated — auto-detect from the first line (unquoted tab vs comma count).
 */

function detectDelimiter(source: string): ',' | '\t' {
  let commas = 0;
  let tabs = 0;
  let inQuotes = false;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '\n' || ch === '\r') break;
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (ch === ',') commas += 1;
    else if (ch === '\t') tabs += 1;
  }
  return tabs > commas ? '\t' : ',';
}

export function parseCsv(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  // A BOM on the first header would bind a column nobody can match by name.
  const source = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(source);

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      record.push(field);
      field = '';
      continue;
    }
    if (ch === '\r') continue;
    if (ch === '\n') {
      record.push(field);
      records.push(record);
      field = '';
      record = [];
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => h.trim());
  const rows = nonEmpty.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim();
    });
    return obj;
  });
  return { headers, rows };
}
