'use client';

/** Center Lock L2 host — a multi-field record form stacked on the desk stage. */

import { useEffect, useRef, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
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
            actions={actions}
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
  onClose: () => void;
  /** The record's own verbs — painted before n of N / ‹ › / ✕. */
  actions?: ReactNode;
}

/**
 * The record's title / walk / ✕ band. One band for both record views:
 * {@link DeskStageOverlay} paints it over the stage (in place), and
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
  actions,
}: DeskStageRecordHeaderProps) {
  return (
    <header className="flex shrink-0 items-start gap-2 border-b border-border-hairline px-4 py-3">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-role-title text-text-default">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 truncate text-role-caption text-text-soft">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      {indexLabel ? (
        <span className="shrink-0 tabular-nums text-role-caption text-text-muted">
          {indexLabel}
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
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Close"
        onClick={onClose}
      >
        <X className="size-4" />
      </Button>
    </header>
  );
}
