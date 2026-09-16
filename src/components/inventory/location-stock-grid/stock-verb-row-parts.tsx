'use client';

/**
 * Shared leaves for the Stock action strip's three rows — the two faces and the
 * one input rule that would otherwise be typed three times.
 *
 * Small on purpose: a strip row is mostly design-system primitives, so what is
 * left to share is the spinner-or-label commit face, the inline failure line,
 * and the digits-only draft rule the endpoints require.
 */

import { Loader2 } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { SLOT_TABLE_ACTION_BAR_CONTROL_CLASS } from '@/lib/tables/slot-table-action-bar-law';

/**
 * A strip CELL — one line, fixed height, never a `TextField`.
 *
 * `TextField` IS its floating label ("the motion is the affordance"): `label`
 * is required and the input is locked to `h-11 pb-1 pt-5`. Mounted in a band
 * of `size="sm"` (32px) Buttons it became the tallest child and set the band's
 * height to 60px — and a CONDITIONAL one (the note field) made that height
 * change when the operator picked a reason, which is the law this cohort now
 * forbids (`slot-table-action-bar-law.ts`).
 *
 * So the strip's text cells are 32px inputs with a placeholder instead of a
 * label. `ds_critique` flags the raw `<input>`; the flag is a known false
 * positive on a dense composer row — `TasksComposerRow`, the sanctioned
 * inline-composer precedent, carries it for the identical reason.
 */
export function StockStripInput({
  value,
  onChange,
  onEnter,
  placeholder,
  ariaLabel,
  testId,
  widthClass,
  numeric = false,
  autoFocus = false,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Enter commits when the row says it is ready; omit for a non-committing cell. */
  onEnter?: () => void;
  placeholder: string;
  ariaLabel: string;
  testId: string;
  widthClass: string;
  numeric?: boolean;
  autoFocus?: boolean;
  /**
   * Inert but MOUNTED. A field the band only sometimes needs is disabled, not
   * removed — a conditional control changes the band's height, which
   * `slot-table-action-bar-law.ts` forbids.
   */
  disabled?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || !onEnter) return;
        event.preventDefault();
        onEnter();
      }}
      {...(numeric ? { inputMode: 'numeric' as const } : null)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      data-testid={testId}
      autoFocus={autoFocus}
      disabled={disabled}
      className={cn(
        SLOT_TABLE_ACTION_BAR_CONTROL_CLASS,
        'min-w-0 shrink-0 rounded-lg border border-border-soft bg-surface-card px-2.5',
        'text-role-micro text-text-default placeholder:text-text-faint',
        'transition-colors hover:border-blue-300 focus:border-blue-500',
        'disabled:cursor-not-allowed disabled:bg-surface-canvas disabled:text-text-faint',
        numeric && 'text-right tabular-nums',
        widthClass,
        focusRing('field', 'accent'),
      )}
    />
  );
}

/**
 * Digits only, five wide.
 *
 * Both write endpoints take a positive integer (`positiveInt` in
 * `schemas/locations.ts`), so a field that accepts `3.5` or `-2` only fails on
 * commit — after the operator has already pressed.
 */
export function stockQtyDraft(next: string): string {
  return next.replace(/[^0-9]/g, '').slice(0, 5);
}

/** Commit button face: the spinner replaces nothing, it joins the label. */
export function StockCommitFace({ busy, label }: { busy: boolean; label: string }) {
  return (
    <>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
      {label}
    </>
  );
}

/**
 * The write's failure, in the strip rather than a toast: the operator is still
 * looking at the row they pressed, and `/api/transfers` answers a short
 * transfer with the number it actually has.
 */
export function StockRowError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <span role="alert" className="text-role-caption font-semibold text-text-danger">
      {error}
    </span>
  );
}
