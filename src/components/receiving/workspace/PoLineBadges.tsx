import { qtyProgress } from '@/design-system/tokens/typography/presets';
import { cn } from '@/utils/_cn';

/** Scanned-qty badge for read-only (triage) rows. A door scan brings the WHOLE
 *  carton in, so scanned == expected (e.g. 1/1) — the same semantics the sidebar
 *  Prioritize/Triage rail renders. Distinct from {@link ProgressBadge}'s floor
 *  counted qty (which is 0 until the carton is unboxed — never swap these). */
export function ScannedBadge({ expected }: { expected: number | null }) {
  return (
    <span className={cn(qtyProgress, 'normal-case tracking-normal text-blue-600')}>
      {expected ?? 1}/{expected ?? '?'}
    </span>
  );
}

/**
 * Floor counted/expected qty for interactive Unbox / unfound rows.
 * Copy uses **counted**, never the inventory noun Received (Unboxed ≠ Received).
 */
export function ProgressBadge({
  received,
  expected,
  className,
}: {
  received: number;
  expected: number | null;
  /** Override size/tone tokens — e.g. `text-role-micro` on a dense eyebrow. */
  className?: string;
}) {
  const qtyClass = cn(qtyProgress, 'normal-case tracking-normal', className);
  if (expected == null || expected <= 0) {
    return <span className={cn(qtyClass, 'text-text-soft')}>{received} counted</span>;
  }
  const done = received >= expected;
  return (
    <span className={cn(qtyClass, done ? 'text-emerald-600/80' : 'text-text-soft')}>
      {received}/{expected}
    </span>
  );
}
