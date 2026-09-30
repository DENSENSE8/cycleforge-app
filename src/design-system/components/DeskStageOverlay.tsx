'use client';

/** Center Lock L2 host — a multi-field record form stacked on the desk stage. */

import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { DeskRecordHeadContext } from './DeskActionSlot';
import { IconButton } from '@/design-system/primitives/IconButton';
import { useRegisterOverlay } from '@/design-system/hooks';
import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { zIndex } from '@/design-system/tokens/z-index';
import { cn } from '@/utils/_cn';

/** Esc inside a text entry leaves the field before it closes a record. */
export function isRecordEscTextEntry(target: EventTarget | null): boolean {
  return isEditableKeyTarget(target) && !(target instanceof HTMLButtonElement);
}

type DeskStageOverlayFill = 'inset' | 'stage';

interface DeskStageOverlayProps {
  /** When false, renders nothing — table ground plane only. */
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Walk position, e.g. `3 of 12`. Omit when not queue-walking. */
  indexLabel?: ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
  className?: string;
  /** Merged onto the panel shell. */
  cardClassName?: string;
  /**
   * When false, the scrim is inert (Esc / header ✕ still close). Use for
   * draft sessions where a stray click must not eat a half-typed form.
   * Default true. Ignored visually when `fill="stage"` (panel is opaque).
   */
  closeOnScrim?: boolean;
  /**
   * `inset` — centered max-measure card (default).
   * `stage` — full width + height of the desk stage card (inline L2).
   */
  fill?: DeskStageOverlayFill;
  /** Paint the title / walk / ✕ band. */
  showHeader?: boolean;
  /** The record's own verbs, painted in the header band before the walk controls. */
  actions?: ReactNode;
  /** The record-view switch (`DeskRecordViewSwitch`) — painted after the verbs. */
  viewSwitch?: ReactNode;
}

export function DeskStageOverlay({
  open,
  onClose,
  title,
  subtitle,
  indexLabel,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  children,
  footer,
  testId = 'desk-stage-overlay',
  className,
  cardClassName,
  closeOnScrim = true,
  fill = 'inset',
  showHeader = true,
  actions,
  viewSwitch,
}: DeskStageOverlayProps) {
  const stageFill = fill === 'stage';
  // An inset form is a transient layer:
  const isTopmost = useRegisterOverlay(open && !stageFill);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Escape closes this overlay only when it owns the key:
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (stageFill ? hasOpenOverlay() : !isTopmost()) return;
      event.preventDefault();
      if (isRecordEscTextEntry(event.target)) {
        (event.target as HTMLElement).blur();
        return;
      }
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, stageFill, isTopmost]);

  if (!open) return null;

  return (
    <div
      className={cn(
        'absolute inset-0 flex min-h-0 overflow-hidden',
        stageFill
          ? 'flex-col items-stretch justify-stretch p-0'
          : 'items-stretch justify-center p-3 sm:p-4',
        className,
      )}
      style={{ zIndex: zIndex.panel }}
      data-testid={testId}
      data-desk-stage-fill={fill}
      role="region"
      aria-label={typeof title === 'string' ? title : 'Record editor'}
    >
      {/* Scrim — opacity only (M2); table remains mounted underneath (Q5). */}
      {stageFill ? null : (
        <button
          type="button"
          className="absolute inset-0 bg-scrim/40"
          aria-label={closeOnScrim ? 'Close record editor' : undefined}
          aria-hidden={!closeOnScrim}
          onClick={closeOnScrim ? onClose : undefined}
          tabIndex={-1}
        />
      )}

      <div
        className={cn(
          'relative z-raised flex min-h-0 flex-col overflow-hidden bg-surface-card',
          stageFill
            ? // Inside DESK_CHROME_STAGE_BODY — flush like DataTable (DESK_TABLE_SURFACE_CLASS).
              cn('h-full w-full max-w-none border-0', cornerClass('flush'), elevationClass('flat'))
            : cn(
                'w-full max-w-3xl border border-border-default',
                cornerClass('surface'),
                elevationClass('overlay'),
              ),
          cardClassName,
        )}
      >
        {showHeader ? (
          <DeskStageRecordHeader
            title={title}
            subtitle={subtitle}
            indexLabel={indexLabel}
            onPrev={onPrev}
            onNext={onNext}
            prevDisabled={prevDisabled}
            nextDisabled={nextDisabled}
            onClose={onClose}
            // Inline (covers the list) → Back, top left; a centred card keeps ✕.
            dismiss={stageFill ? 'back' : 'close'}
            actions={actions}
            viewSwitch={viewSwitch}
          />
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>

        {footer ? (
          <footer className="shrink-0 border-t border-border-hairline px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

interface DeskStageRecordHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  indexLabel?: ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  /** Omit for a record with nowhere to close to (a deep-linked lookup) — no Back / ✕. */
  onClose?: () => void;
  /**
   * Where the way out sits (owner 2026-09-27): a record shown INLINE over the
   * list gets `back` — "‹ Back" at the top left, like leaving a page; a record
   * BESIDE the list (the split pane, a side rail) or a centred card gets
   * `close` — ✕ at the top right, like dismissing a panel.
   */
  dismiss?: 'back' | 'close';
  /** The record's own verbs — painted before n of N / ‹ › / ✕. */
  actions?: ReactNode;
  /** The record-view switch — after the verbs, before n of N / ‹ › / ✕. */
  viewSwitch?: ReactNode;
  /**
   * A rail desk (`DeskRecordPlane listRail`, owner 2026-09-27): the verbs sit
   * AFTER n of N — `n of N · verbs · ✕`. The ✕ is ALWAYS the top-right-most
   * control wherever it shows (owner 2026-09-28); an always-open rail passes no
   * `onClose` — nothing to close to, so its CTA ends the row. Default off:
   * other desks keep verbs · n of N · ✕.
   */
  rail?: boolean;
}

/**
 * The record's title / walk / way-out band. One band for both record views:
 * {@link DeskStageOverlay} paints it over the stage (in place → Back), and
 * `DeskRecordPlane` paints it on the split pane — never a second header.
 */
export function DeskStageRecordHeader({
  title,
  subtitle,
  indexLabel,
  onPrev,
  onNext,
  prevDisabled,
  nextDisabled,
  onClose,
  dismiss = 'close',
  actions,
  viewSwitch,
  rail = false,
}: DeskStageRecordHeaderProps) {
  // The title takes the band's width first (owner 2026-09-29: two lines, then
  // clamp); the verbs keep their collapsed row and expand into what is left
  // (RecordActionStrip's header face). `DeskHeaderAction`s inside drop their
  // labels to icons while the band is compact (`DeskRecordHeadContext`).
  const verbs = actions ? (
    <DeskRecordHeadContext.Provider value>
      <div className={cn('flex items-center justify-end gap-1.5', rail ? 'min-w-0 shrink-0' : 'flex-1')}>
        {actions}
      </div>
    </DeskRecordHeadContext.Provider>
  ) : null;
  return (
    // A container, so the band sheds its secondary pieces (n of N, then the
    // view switch) as the record column narrows instead of crushing the title.
    <header
      className={cn(
        '@container/record-head relative z-raised flex shrink-0 flex-nowrap items-center gap-1.5 border-b border-border-hairline px-3 py-3 scrollbar-hide @sm:px-4',
        rail ? 'overflow-visible' : 'overflow-x-auto',
      )}
    >
      {onClose && dismiss === 'back' ? (
        // The arrow is the resting face. Its circular hit-area is disclosed
        // only on hover/focus, so the record identity—not button chrome—owns
        // the top-left of the detail view.
        <IconButton
          icon={<ArrowLeft className="size-5" />}
          ariaLabel="Back to the list"
          title="Back (Esc)"
          size="touch"
          radius="modePill"
          onClick={onClose}
          data-testid="desk-record-back"
          className="-ml-2 bg-transparent text-text-default hover:bg-surface-sunken focus-visible:bg-surface-sunken"
        />
      ) : null}
      <div className="min-w-0 flex-auto">
        <h2
          title={typeof title === 'string' ? title : undefined}
          className="line-clamp-2 [overflow-wrap:anywhere] text-role-data font-semibold text-text-default @lg/record-head:text-role-title"
        >
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 truncate text-role-caption text-text-soft">{subtitle}</p>
        ) : null}
      </div>
      {rail ? null : verbs}
      {/* Hierarchy: where you are (n of N), then how you view it, then ✕. */}
      {indexLabel ? (
        <span className="hidden shrink-0 tabular-nums text-role-caption text-text-muted @sm/record-head:inline">
          {indexLabel}
        </span>
      ) : null}
      {viewSwitch ? (
        <span className="hidden shrink-0 @lg/record-head:flex">
          <DeskRecordHeadContext.Provider value>{viewSwitch}</DeskRecordHeadContext.Provider>
        </span>
      ) : null}
      {(onPrev || onNext) && (
        <div className="flex shrink-0 items-center gap-0.5">
          {onPrev ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Previous record"
              onClick={onPrev}
              disabled={prevDisabled}
            >
              <ChevronLeft className="size-4" />
            </Button>
          ) : null}
          {onNext ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Next record"
              onClick={onNext}
              disabled={nextDisabled}
            >
              <ChevronRight className="size-4" />
            </Button>
          ) : null}
        </div>
      )}
      {rail ? verbs : null}
      {onClose && dismiss === 'close' ? (
        <IconButton
          type="button"
          size="sm"
          radius="pill"
          tone="neutral"
          icon={<X className="size-4" />}
          ariaLabel="Close"
          title="Close (Esc)"
          onClick={onClose}
          data-testid="desk-record-close"
        />
      ) : null}
    </header>
  );
}
