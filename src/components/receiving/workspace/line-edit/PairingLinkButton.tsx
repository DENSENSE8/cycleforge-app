'use client';

/**
 * Shared pairing candidate row + link action + linked badge.
 *
 * Every Package Pairing avenue (PO, Store/Ecwid, Tickets) shares one skeleton:
 * optional media · title · meta · trailing action. Interaction models differ
 * (trailing Link button vs whole-row click) via `action` / `onSelect` — not
 * via forked row chrome.
 *
 * Suggested matches (tracking / system signal) use `suggested` for a subtle
 * tint + eyebrow — never fabricated percentage scores.
 */

import type { ReactNode } from 'react';
import { Check, Link2, Star } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

/**
 * Outer chrome for a link-style pairing candidate — flush on Displays plane.
 * No `inset-field` here — a media row needs its thumb to bleed to the shell
 * edge, so the inset is applied per-variant in `shellClass` instead (never
 * stacked with a second inset on the inner flex row, which is how the old
 * media layout doubled up and boxed the thumb away from the edge).
 */
const PAIRING_CANDIDATE_ROW_CLASS = cn(
  'min-w-0 border border-border-soft bg-surface-card transition-colors hover:border-border-default hover:bg-surface-hover',
);

type PairingCandidateRowProps = {
  className?: string;
  /** Leading media (thumb / icon). */
  media?: ReactNode;
  /** Primary line. */
  title?: ReactNode;
  /** Secondary meta row (SKU, status chips, age). */
  meta?: ReactNode;
  /** Trailing action slot (Link button / badge / “Adding…”). */
  action?: ReactNode;
  /** Whole-row select (Ecwid add). When set, the row is a button. */
  onSelect?: () => void;
  disabled?: boolean;
  /** Suggested / system match — tint + sparkle eyebrow; no scores. */
  suggested?: boolean;
  /** Suggested eyebrow copy — default “Suggested”. */
  suggestedLabel?: string;
  /** Linked / matched emphasis (emerald ring). */
  linked?: boolean;
  /**
   * Legacy free-form children (PoLinkTab pre-slot). Prefer slots for new rows.
   * When slots (`title` / `media` / `meta` / `action`) are used, children are ignored.
   */
  children?: ReactNode;
};

export function PairingCandidateRow({
  children,
  className,
  media,
  title,
  meta,
  action,
  onSelect,
  disabled = false,
  suggested = false,
  suggestedLabel = 'Suggested',
  linked = false,
}: PairingCandidateRowProps) {
  const useSlots = title != null || media != null || meta != null || action != null;
  const hasMedia = media != null;

  const shellClass = cn(
    PAIRING_CANDIDATE_ROW_CLASS,
    // `media` rows bleed their own thumb edge-to-edge (ItemRecordThumb — same
    // primitive the PO line row uses) — the shell carries no inset of its own
    // for them. `inset-field`'s uniform padding stacked with the body row's
    // own gutter is what boxed the thumb away from the edge before
    // (2026-08-24 fix). Media-less rows (PoLinkTab) keep `inset-field`, unchanged.
    !hasMedia && 'inset-field',
    linked && 'border-emerald-300 bg-emerald-50 ring-1 ring-inset ring-emerald-400',
    suggested && !linked && 'border-violet-200 bg-violet-50/60',
    onSelect && 'w-full text-left',
    className,
  );

  const content = (
    <div className="min-w-0 flex-1">
      {suggested ? (
        <div className="mb-0.5 flex items-center gap-1 text-role-eyebrow uppercase tracking-widest text-violet-700">
          <Star className="h-3 w-3" aria-hidden />
          {suggestedLabel}
        </div>
      ) : null}
      {title != null ? (
        typeof title === 'string' || typeof title === 'number' ? (
          <div className="truncate text-sm font-semibold text-text-default">{title}</div>
        ) : (
          <div className="min-w-0">{title}</div>
        )
      ) : null}
      {meta != null ? <div className="mt-0.5 min-w-0">{meta}</div> : null}
    </div>
  );

  const body = !useSlots
    ? children
    : hasMedia ? (
      // Thumb flush left, full row height (ItemRecordThumb is self-stretch) —
      // content column carries the inset-field padding the thumb bled past.
      // `py-1.5` (not `py-2`): the thumb's own `min-h-20` sets row height, so
      // this is pure top/bottom air around a two-line title+meta stack — kept
      // tight rather than centered with slack (2026-08-24 fix).
      <div className="flex w-full min-w-0 items-stretch gap-2.5">
        {media}
        <div className="flex min-w-0 flex-1 items-center gap-2.5 py-1.5 pr-2.5">
          {content}
          {action != null ? <div className="shrink-0">{action}</div> : null}
        </div>
      </div>
    ) : (
      // No second inset. The shell already carries `inset-field`; this row used
      // to add `px-2.5 py-2` on top of it, so a media-less candidate sat 22px
      // off the display edge with 16px of stacked vertical air — the exact
      // stacking the media branch above was fixed for in 2026-08-24. Padding
      // belongs to the shell, spacing between rows to the list.
      <div className="flex w-full min-w-0 items-center gap-2.5">
        {content}
        {action != null ? <div className="shrink-0">{action}</div> : null}
      </div>
    );

  if (onSelect) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={cn(
          'ds-raw-button',
          shellClass,
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {body}
      </button>
    );
  }

  return <div className={shellClass}>{body}</div>;
}

export function PairingLinkButton({
  onClick,
  loading = false,
  disabled = false,
  label = 'Link',
}: {
  onClick: () => void;
  /** This row's link is in flight (spinner). */
  loading?: boolean;
  /** Another row's link is in flight (block double-submits). */
  disabled?: boolean;
  /** Verb override — defaults to "Link"; e.g. "Relink", "Match". */
  label?: string;
}) {
  return (
    <Button
      type="button"
      variant="primary"
      size="sm"
      icon={<Link2 />}
      loading={loading}
      disabled={disabled}
      onClick={onClick}
      className="h-7 shrink-0 px-2.5 uppercase tracking-wider"
    >
      {label}
    </Button>
  );
}

/** Done-state pill shown in place of {@link PairingLinkButton} for the linked row. */
export function PairingLinkedBadge({ label = 'Linked' }: { label?: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 text-role-eyebrow uppercase tracking-widest text-emerald-600">
      <Check className="h-3.5 w-3.5" /> {label}
    </span>
  );
}
