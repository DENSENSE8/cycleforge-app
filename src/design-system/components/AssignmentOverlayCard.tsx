'use client';

import type { ReactNode } from 'react';
import { X } from '@/components/Icons';
import { Dialog, DialogContent, DialogTitle } from '@/design-system/components/Dialog';
import { cn } from '@/utils/_cn';

interface AssignmentOverlayCardProps {
  topBar?: ReactNode;
  headerEyebrow?: ReactNode;
  /** Omit or pass `null` to hide the `<h3>` (e.g. render the title inside `children` instead). */
  title?: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  className?: string;
  bodyClassName?: string;
  widthClassName?: string;
  /** Merged into `<header>` (e.g. `py-2` for a denser toolbar + title block). */
  headerClassName?: string;
  /**
   * `center` — flex-centered in the viewport; dialog height follows content up to max-h.
   * `midAnchor` — horizontal center; bottom edge sits on the viewport midline so extra height grows upward only.
   * `bottom` — pinned above the safe bottom; extra height grows upward; max-h caps overflow.
   */
  dialogPosition?: 'center' | 'midAnchor' | 'bottom';
  showHeaderGradient?: boolean;
  showCloseButton?: boolean;
}

export function AssignmentOverlayCard({
  topBar,
  headerEyebrow,
  title,
  subtitle,
  meta,
  children,
  footer,
  onClose,
  className = '',
  bodyClassName = '',
  widthClassName = 'w-[94vw] max-w-[480px]',
  headerClassName = '',
  dialogPosition = 'center',
  showHeaderGradient = true,
  showCloseButton = true,
}: AssignmentOverlayCardProps) {
  const isBottom = dialogPosition === 'bottom';
  const isMidAnchor = dialogPosition === 'midAnchor';

  const maxHeightClass = isMidAnchor
    ? 'max-h-[calc(50vh-env(safe-area-inset-top,0px)-0.75rem)]'
    : 'max-h-[min(92vh,860px)]';

  const sectionShell = [
    'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border-default/70 bg-surface-card shadow-[0_28px_72px_rgba(15,23,42,0.22)]',
    maxHeightClass,
    widthClassName,
    className,
  ]
    .join(' ')
    .trim();

  const headerBlock = (
    <header
      className={`shrink-0 border-b border-border-emphasis/20 px-4 py-3 ${showHeaderGradient ? 'bg-[linear-gradient(180deg,#2563EB,#3B82F6)] text-white' : ''} ${headerClassName}`.trim()}
    >
      {headerEyebrow ? (
        <div
          className={`mb-1.5 w-full min-w-0 ${showHeaderGradient ? 'text-blue-100' : 'text-text-muted'}`.trim()}
        >
          {headerEyebrow}
        </div>
      ) : null}
      <div
        className={`flex items-start justify-between gap-3 ${subtitle || meta ? 'mb-2' : 'mb-0'}`.trim()}
      >
        <div className="min-w-0 flex-1">
          {!headerEyebrow ? (
            <div className={`${showHeaderGradient ? 'text-blue-100' : 'text-text-muted'}`.trim()}>
              <p className={`truncate text-role-eyebrow uppercase tracking-[0.10rem] ${showHeaderGradient ? 'text-blue-100' : 'text-text-soft'}`.trim()}>
                Assignment
              </p>
            </div>
          ) : null}
          {title != null ? (
            // DialogTitle so the overlay has a real accessible name (Radix warns
            // without one); renders an <h2> — the modal's own top-level heading.
            <DialogTitle
              className={`text-2xl font-black leading-[1.1] tracking-tight ${showHeaderGradient ? 'text-white' : 'text-text-default'} ${!headerEyebrow ? 'mt-1' : ''}`.trim()}
            >
              {title}
            </DialogTitle>
          ) : null}
          {subtitle ? (
            <div
              className={`mt-2 min-w-0 ${showHeaderGradient ? 'text-blue-100' : ''}`.trim()}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
        {showCloseButton ? (
          <button
            type="button"
            onClick={onClose}
            className={`mt-0.5 shrink-0 transition-colors duration-100 ease-out hover:opacity-100 active:scale-95 ${showHeaderGradient ? 'text-white/80 hover:text-white' : 'text-text-soft hover:text-text-default'}`.trim()}
            aria-label="Close"
            title="Close"
          >
            <X className="h-[14px] w-[14px]" />
          </button>
        ) : null}
      </div>
      {meta ? (
        <div className={`text-role-eyebrow uppercase tracking-[0.08em] ${showHeaderGradient ? 'text-blue-100' : 'text-text-soft'}`.trim()}>
          {meta}
        </div>
      ) : null}
    </header>
  );

  const bodyClasses = `flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-3 ${bodyClassName}`.trim();

  // Position within the viewport. Radix centers by default; the other two modes
  // override the transform so extra height only ever grows upward.
  const positionClass = isBottom
    ? 'top-auto bottom-[max(1rem,5vh)] translate-y-0' // ds-allow-spacing: fixed-overlay safe-bottom geometry
    : isMidAnchor
      ? 'top-1/2 -translate-y-full'
      : '';

  // Radix portals to <body>, so the overlay escapes any transformed / animated
  // ancestor — this renders inside slide-over detail panels' motion.div, a
  // stacking + containing-context trap that used to require a manual portal.
  // `takeover` (1200) keeps it above the detail stack (160) and modal (200).
  return (
    <Dialog open onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        // Fallback name for the `title={null}` call sites that render their own heading.
        aria-label={title == null ? 'Assignment' : undefined}
        overlayClassName="z-takeover bg-scrim/55 backdrop-blur-[4px]"
        className={cn(
          'z-takeover max-w-none border-0 bg-transparent p-0 shadow-none',
          'max-h-[calc(100dvh-1.5rem)]',
          positionClass,
        )}
      >
        <section className={sectionShell}>
          {topBar ? <div className="shrink-0 border-b border-border-hairline">{topBar}</div> : null}
          {headerBlock}

          <div className={bodyClasses}>{children}</div>

          {footer ? (
            <footer className="shrink-0 border-t border-border-emphasis/20 px-4 py-3">
              {footer}
            </footer>
          ) : null}
        </section>
      </DialogContent>
    </Dialog>
  );
}
