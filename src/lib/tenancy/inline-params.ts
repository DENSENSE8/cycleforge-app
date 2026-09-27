/**
 * Bind `$n` parameters as SQL literals, for the one-round-trip tenant read
 * (`tenantQueryOneTrip`). The simple-query protocol carries no parameters, so
 * the values travel inside the text: quoting here is the whole injection
 * boundary and mirrors node-postgres' `escapeLiteral` exactly (doubled single
 * quotes; an `E''` string with doubled backslashes when a backslash appears).
 *
 * Literals are left untyped, so the statement's own casts and operator context
 * resolve them the way a bound parameter would be resolved.
 */

type SqlParam = string | number | bigint | boolean | Date | null | undefined | readonly SqlParam[];

function escapeText(value: string): string {
  if (value.includes('\0')) throw new Error('inlineSqlParams: NUL byte in a text value');
  let hasBackslash = false;
  let out = "'";
  for (const ch of value) {
    if (ch === "'") out += "''";
    else if (ch === '\\') {
      out += '\\\\';
      hasBackslash = true;
    } else out += ch;
  }
  out += "'";
  return hasBackslash ? ` E${out}` : out;
}

/** Postgres array text (`{"a","b",NULL}`) — the same form pg sends a JS array as. */
function arrayText(values: readonly SqlParam[]): string {
  const parts = values.map((v) => {
    if (v === null || v === undefined) return 'NULL';
    if (Array.isArray(v)) return arrayText(v);
    const s = scalarText(v as Exclude<SqlParam, readonly SqlParam[] | null | undefined>);
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  });
  return `{${parts.join(',')}}`;
}

function scalarText(value: string | number | bigint | boolean | Date): string {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('inlineSqlParams: non-finite number');
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** One value as a SQL literal. */
export function sqlLiteral(value: SqlParam): string {
  if (value === null || value === undefined) return 'NULL';
  if (Array.isArray(value)) return escapeText(arrayText(value));
  return escapeText(scalarText(value as string | number | bigint | boolean | Date));
}

/**
 * Replace every `$n` placeholder with the literal for `params[n-1]`. Callers'
 * SQL must not carry `$n` inside string literals or dollar quotes (none of the
 * statements this serves do). A placeholder without a value throws.
 */
export function inlineSqlParams(text: string, params: ReadonlyArray<unknown>): string {
  return text.replace(/\$(\d+)(?!\d)/g, (_match, digits: string) => {
    const index = Number(digits) - 1;
    if (index < 0 || index >= params.length) {
      throw new Error(`inlineSqlParams: no value for $${digits}`);
    }
    return sqlLiteral(params[index] as SqlParam);
  });
}
