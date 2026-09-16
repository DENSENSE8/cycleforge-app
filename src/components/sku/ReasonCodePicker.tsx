'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/utils/_cn';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReasonCode {
  id: number;
  code: string;
  label: string;
  category: string;
  direction: 'in' | 'out' | 'either';
  requires_note: boolean;
  requires_photo: boolean;
}

interface ReasonCodePickerProps {
  /** Filter codes by the direction of the impending adjustment. */
  direction: 'in' | 'out';
  value: number | null;
  onChange: (next: ReasonCode | null) => void;
  /** Optional cap on dropdown height. */
  maxHeight?: number;
  /** Compact rendering for tight sheets. */
  compact?: boolean;
}

// Memoize the fetch so opening the same picker on different sheets doesn't
// fire repeat requests. Reasons rarely change.
const cache: Map<string, Promise<ReasonCode[]>> = new Map();

async function loadReasons(direction: 'in' | 'out'): Promise<ReasonCode[]> {
  const key = `direction=${direction}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const promise = fetch(`/api/reason-codes?direction=${direction}`, { cache: 'no-store' })
    .then((res) => res.json())
    .then((data) =>
      Array.isArray(data?.reason_codes) ? (data.reason_codes as ReasonCode[]) : [],
    )
    .catch(() => []);
  cache.set(key, promise);
  return promise;
}

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * Compact dropdown for picking a `reason_codes` row. Used inside the Numpad
 * sheet's footer and the Details sheet's swap section. Pre-selects the
 * highest-priority default for the given direction.
 */
export function ReasonCodePicker({
  direction,
  value,
  onChange,
  compact = false,
}: ReasonCodePickerProps) {
  const [reasons, setReasons] = useState<ReasonCode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadReasons(direction).then((rows) => {
      if (cancelled) return;
      setReasons(rows);
      setLoading(false);
      // Auto-select the canonical movement code for the direction when the
      // caller hasn't already picked one — e.g. TAKE defaults to BIN_PULL.
      if (value == null && rows.length > 0) {
        const fallback =
          rows.find((r) => r.code === (direction === 'out' ? 'BIN_PULL' : 'BIN_ADD')) ??
          rows[0];
        onChange(fallback);
      }
    });
    return () => {
      cancelled = true;
    };
    // value/onChange intentionally not in deps — we only seed on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction]);

  /*
   * NO LABEL and NO conditional child — both were removed 2026-09-15.
   *
   * The label was a hardcoded `<span>Reason</span>` with no prop to suppress
   * it, printed above a select whose own value already reads "Put into bin".
   * Redundant on every one of the four mounts, and on the action strip it was
   * a title inside a 32px toolbar cell.
   *
   * The `requires_note` line was a conditional `<p>` INSIDE the same
   * `<label>`, so this control had no fixed height: picking a reason that
   * needs a note made it taller, and anything laid out beside it reflowed.
   * That is the exact failure `slot-table-action-bar-law.ts` forbids. Every
   * caller already reads `requires_note` off the `ReasonCode` this component
   * hands to `onChange` and renders its own note field — so the internal line
   * was duplicating a fact the host was already acting on.
   *
   * Height is now a TOKEN, not padding: `h-8` on the strip scale, `h-9` for a
   * roomier sheet. `py-*` could never line up with a row of `h-*` controls.
   */
  return (
    <select
      value={value ?? ''}
      onChange={(e) => {
        const id = Number(e.target.value);
        const match = reasons.find((r) => r.id === id) ?? null;
        onChange(match);
      }}
      disabled={loading || reasons.length === 0}
      aria-label="Reason"
      className={cn(
        'w-full rounded-md border border-border-default bg-surface-card px-2',
        'font-semibold text-text-default focus:border-blue-500 focus:outline-none',
        'disabled:opacity-50',
        compact ? 'h-8 text-role-micro' : 'h-9 text-role-caption',
      )}
    >
      {loading && <option>Loading…</option>}
      {!loading &&
        reasons.map((r) => (
          <option key={r.id} value={r.id}>
            {r.label}
          </option>
        ))}
    </select>
  );
}

export { loadReasons };
