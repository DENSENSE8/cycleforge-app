import type { TimelineChange } from './types';

type PlainObject = Record<string, unknown>;

function isPlainObject(v: unknown): v is PlainObject {
  return v != null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
}

/** `pairing_sku` / `pairingSku` / `pairing-sku` → "Pairing sku" (sentence case). */
export function humanizeAuditKey(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

/**
 * Format one audit value for display, or null when absent (renders `—`).
 * Never emits raw JSON: arrays join with `, `, deeper objects read as
 * `Field: value` pairs.
 */
function fmtVal(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() === '' ? null : v;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (Array.isArray(v)) {
    const parts = v.map(fmtVal).filter((p): p is string => p != null);
    return parts.length ? parts.join(', ') : null;
  }
  if (isPlainObject(v)) {
    const parts = Object.entries(v)
      .map(([k, inner]) => {
        const f = fmtVal(inner);
        return f == null ? null : `${humanizeAuditKey(k)}: ${f}`;
      })
      .filter((p): p is string => p != null);
    return parts.length ? parts.join(', ') : null;
  }
  return String(v);
}

/**
 * Structured field-level diff for an audit row → the `TimelineItem.changes` slot,
 * rendered as `Field: before → after` (humanized key, `null` side = `—`,
 * unchanged keys skipped, nested objects flattened one level: `Pairing sku`).
 *
 * SECURITY-LOAD-BEARING CONTRACT: requires BOTH `before` and `after` to be
 * present — a one-sided (creation / deletion / redacted) payload yields `[]`,
 * so no values leak through a half snapshot.
 */
export function diffChanges(
  before: PlainObject | null | undefined,
  after: PlainObject | null | undefined,
  max = 12,
): TimelineChange[] {
  if (!before || !after) return [];
  const out: TimelineChange[] = [];
  const push = (key: string, b: string | null, a: string | null): boolean => {
    if (b === a) return false;
    out.push({ key, before: b, after: a });
    return out.length >= max;
  };

  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    const bv = before[key];
    const av = after[key];
    const bObj = isPlainObject(bv);
    const aObj = isPlainObject(av);
    // Flatten one level when both sides are objects, or one is and the other is absent.
    if ((bObj || bv == null) && (aObj || av == null) && (bObj || aObj)) {
      const bRec = bObj ? bv : {};
      const aRec = aObj ? av : {};
      const subKeys = new Set<string>([...Object.keys(bRec), ...Object.keys(aRec)]);
      let full = false;
      for (const sub of subKeys) {
        if (push(humanizeAuditKey(`${key} ${sub}`), fmtVal(bRec[sub]), fmtVal(aRec[sub]))) {
          full = true;
          break;
        }
      }
      if (full) break;
      continue;
    }
    if (push(humanizeAuditKey(key), fmtVal(bv), fmtVal(av))) break;
  }
  return out;
}
