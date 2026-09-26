import type { TimelineChange } from './types';

/** Format one audit value for display, or null when absent. */
function fmtVal(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

/**
 * Structured field-level diff for an audit row → the `TimelineItem.changes` slot (`key:
 * SECURITY-LOAD-BEARING CONTRACT: requires BOTH `before` and `after` to be
 */
export function diffChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
  max = 12,
): TimelineChange[] {
  if (!before || !after) return [];
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  const out: TimelineChange[] = [];
  for (const key of keys) {
    const b = fmtVal(before[key]);
    const a = fmtVal(after[key]);
    if (b === a) continue;
    out.push({ key, before: b, after: a });
    if (out.length >= max) break;
  }
  return out;
}
