/**
 * Evidence-column facts that DISCLOSE — the Selected-order column of the
 * industrial record ledger (To-ship). Three parts, one geometry:
 *
 *   EvidenceFactRow         label · value, ruled underneath (no disclosure)
 *   EvidenceFactDisclosure  label · value · +/−; expands in place for detail
 *   EvidenceDisclosure      a collapsible block (Labels, Price, Customer):
 *                           label · summary · +/−; the body never repeats it
 *
 * The +/− sits in {@link RECORD_TRAILING_CELL_CLASS}, the one trailing axis
 * every right-edge glyph in the row shares (open ↗, edit ✎, a picker's ⌄ via
 * {@link RECORD_TRAILING_GLYPH_INSET_CLASS}). Label lane is the record's w-24.
 * Colours are the region's mode.
 */
import type { ReactNode } from 'react';
import { Minus, Plus } from '@/components/Icons';
import { RECORD_LABEL_CLASS, RECORD_TRAILING_CELL_CLASS } from '@/design-system/tokens/industrial-record';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** Desk hit floor for a disclosure row (32px). */
const HIT_CLASS = 'min-h-mode-hit';

const SUMMARY_CLASS = cn(
  'flex min-w-0 cursor-pointer list-none items-center [&::-webkit-details-marker]:hidden',
  focusRing('control'),
);

/** One fact row: mono label beside (or over, `wide`) its value, ruled underneath. */
export function EvidenceFactRow({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('flex min-w-0 border-b border-mode-edge', wide ? 'flex-col py-2' : 'items-center')}>
      <span className={cn(RECORD_LABEL_CLASS, 'w-24 shrink-0 text-mode-muted', !wide && 'py-2')}>{label}</span>
      <div className="min-w-0 flex-1 text-role-data text-mode-ink">{children}</div>
    </div>
  );
}

/**
 * A collapsible block of the evidence column: one row — label left, its
 * summary, then + collapsed / − expanded in the trailing cell. The body owns
 * its own content; the header is never repeated inside.
 */
export function EvidenceDisclosure({
  label,
  summary,
  testId,
  children,
}: {
  label: string;
  summary?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <details data-testid={testId} className="group/section border-b border-mode-ink">
      <summary className={cn(SUMMARY_CLASS, 'gap-2 px-4', HIT_CLASS)}>
        <span className={cn(RECORD_LABEL_CLASS, 'shrink-0 text-mode-muted')}>{label}</span>
        <span className="flex min-w-0 flex-1 items-center justify-end truncate">{summary}</span>
        <span aria-hidden className={cn(RECORD_TRAILING_CELL_CLASS, 'text-mode-muted')}>
          <Plus className="h-3.5 w-3.5 group-open/section:hidden" />
          <Minus className="hidden h-3.5 w-3.5 group-open/section:block" />
        </span>
      </summary>
      <div className="border-t border-mode-edge">{children}</div>
    </details>
  );
}

/**
 * A fact that stays ONE row (label · value · +/−) and expands in place for its
 * details and editor. The expanded body never repeats the value.
 */
export function EvidenceFactDisclosure({
  label,
  value,
  testId,
  children,
}: {
  label: string;
  value: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <details data-testid={testId} className="group/fact border-b border-mode-edge">
      <summary className={cn(SUMMARY_CLASS, HIT_CLASS)}>
        <span className={cn(RECORD_LABEL_CLASS, 'w-24 shrink-0 py-2 text-mode-muted')}>{label}</span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-role-data text-mode-ink">{value}</span>
        <span aria-hidden className={cn(RECORD_TRAILING_CELL_CLASS, 'text-mode-muted')}>
          <Plus className="h-3.5 w-3.5 group-open/fact:hidden" />
          <Minus className="hidden h-3.5 w-3.5 group-open/fact:block" />
        </span>
      </summary>
      <div className="flex flex-col gap-1 pb-2 pl-24">{children}</div>
    </details>
  );
}
