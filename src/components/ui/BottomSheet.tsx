'use client';

import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMediaQuery } from '@/hooks/_ui';
import { useRegisterOverlay } from '@/design-system/hooks/useOverlayStack';
import { zIndex as zLayer } from '@/design-system/tokens/z-index';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';



/**
 * Responsive overlay primitive.
 *
 *   mobile (< md):  bottom-anchored sheet with drag-to-dismiss + drag handle.
 *   desktop (≥ md): centered dialog with fade + scale-in entrance.
 *
 * Always portals to <body> so the scrim covers the full viewport even when an
 * ancestor establishes a fixed-positioning containing block (transform,
 * filter, backdrop-filter, will-change, perspective, contain).
 *
 * Callers can force a variant via `forceVariant` if they want consistent
 * physics regardless of viewport (rare — keep at 'auto' by default).
 */

type Variant = 'auto' | 'sheet' | 'dialog';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Hide drag-to-dismiss + handle. Implicit for destructive confirmations. */
  dragDisabled?: boolean;
  /** Override the max-width on desktop. Default 28rem. */
  maxWidth?: string;
  /** Pin the panel to `maxWidth` instead of shrinking with the content. */
  fixedWidth?: boolean;
  /**
   * Cap the panel height and scroll the body. Title (and any chrome above
   * the body) stay put. Used by long pickers (switch-staff).
   */
  scrollBody?: boolean;
  /**
   * Override the scrollBody max-height class (dialog + sheet). Default
   * `max-h-[min(36rem,calc(100vh-2rem))]`. Dense canvases (print-run) pass a
   * taller clamp so a sticky footer stays in view.
   */
  scrollBodyMaxHeightClass?: string;
  /** Force a specific variant regardless of viewport. */
  forceVariant?: Variant;
  /**
   * Tight padding + smaller title — a chip sheet (order notes from Morphing),
   * not a four-row picker. Default padding stays for long pickers.
   */
  compact?: boolean;
  /**
   * Stacking level. 0 = base (z-index 200). Each level adds 10 so a
   * confirmation sheet can sit cleanly on top of an action sheet. The scrim
   * is also slightly darker per level so the parent sheet visibly recedes.
   */
  level?: number;
  children: React.ReactNode;
}

const DESKTOP_BREAKPOINT = '(min-width: 768px)';

const DEFAULT_SCROLL_BODY_MAX_H = 'max-h-[min(36rem,calc(100vh-2rem))]';

export function BottomSheet({
  open,
  onClose,
  title,
  dragDisabled = false,
  maxWidth = '28rem',
  fixedWidth = false,
  scrollBody = false,
  scrollBodyMaxHeightClass = DEFAULT_SCROLL_BODY_MAX_H,
  forceVariant = 'auto',
  level = 0,
  compact = false,
  children,
}: BottomSheetProps) {
  const reduceMotion = useReducedMotion();
  const isDesktop = useMediaQuery(DESKTOP_BREAKPOINT);
  const variant: Variant =
    forceVariant !== 'auto' ? forceVariant : isDesktop ? 'dialog' : 'sheet';

  // Claim keyboard ownership so dashboard capture listeners (queue cursor,
  // nav leader) stand down instead of eating Escape before this sheet.
  useRegisterOverlay(open);

  // Track portal target — only mount on the client side.
  const [portalNode, setPortalNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setPortalNode(document.body);
  }, []);

  // Lock body scroll + Escape-to-close while open. Capture so we own the
  // key even if a late-mounted bubble listener is still live.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  if (!portalNode) return null;

  // Base at zLayer.modal; each level adds 10. Clamp to <10 so a deeply-stacked
  // sheet can never climb into the elevatedModal band (300).
  const safeLevel = Math.min(Math.max(level, 0), 9);
  const layerZ = zLayer.modal + (safeLevel * 10);
  const scrimOpacity = Math.min(0.4 + (safeLevel * 0.1), 0.7);

  const overlay = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0" style={{ zIndex: layerZ }}>
          {/* Scrim — darker on stacked levels so the parent sheet recedes. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
            onClick={onClose}
            className="absolute inset-0 backdrop-blur-sm"
            style={{ backgroundColor: `rgba(0,0,0,${scrimOpacity})` }}
          />

          {variant === 'sheet' ? (
            <SheetPanel
              title={title}
              dragDisabled={dragDisabled}
              maxWidth={maxWidth}
              fixedWidth={fixedWidth}
              scrollBody={scrollBody}
              scrollBodyMaxHeightClass={scrollBodyMaxHeightClass}
              reduceMotion={!!reduceMotion}
              compact={compact}
              onClose={onClose}
            >
              {children}
            </SheetPanel>
          ) : (
            <DialogPanel
              title={title}
              maxWidth={maxWidth}
              fixedWidth={fixedWidth}
              scrollBody={scrollBody}
              scrollBodyMaxHeightClass={scrollBodyMaxHeightClass}
              reduceMotion={!!reduceMotion}
              onClose={onClose}
            >
              {children}
            </DialogPanel>
          )}
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(overlay, portalNode);
}

// ─── Mobile variant: bottom-anchored sheet ─────────────────────────────────

interface SheetPanelProps {
  title?: string;
  dragDisabled: boolean;
  maxWidth: string;
  fixedWidth: boolean;
  scrollBody: boolean;
  scrollBodyMaxHeightClass: string;
  reduceMotion: boolean;
  compact: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function SheetPanel({
  title,
  dragDisabled,
  maxWidth,
  fixedWidth,
  scrollBody,
  scrollBodyMaxHeightClass,
  reduceMotion,
  compact,
  onClose,
  children,
}: SheetPanelProps) {
  return (
    <div className="absolute inset-x-0 bottom-0 flex justify-center">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: 'spring', damping: 32, stiffness: 320, mass: 0.9 }
        }
        drag={dragDisabled ? false : 'y'}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > 100 || info.velocity.y > 600) onClose();
        }}
        className={cn(
          'w-full overflow-hidden rounded-t-[28px] bg-surface-card shadow-[0_-12px_48px_-16px_rgba(0,0,0,0.25)]',
          scrollBody && cn('flex min-h-0 flex-col', scrollBodyMaxHeightClass),
        )}
        style={{
          maxWidth,
          width: fixedWidth ? `min(${maxWidth}, 100%)` : undefined,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {!dragDisabled && (
          <div className={cn('flex justify-center', compact ? 'pt-2 pb-0.5' : 'pt-3 pb-1')}>
            <div className="h-1.5 w-12 rounded-full bg-surface-strong" />
          </div>
        )}
        {title && (
          <div className={cn('text-center', compact ? 'px-3 pt-1 pb-0.5' : 'px-6 pt-2 pb-1')}>
            <h3
              className={cn(
                'font-semibold tracking-tight text-text-default',
                compact ? 'text-role-caption' : 'text-base',
              )}
            >
              {title}
            </h3>
          </div>
        )}
        <div
          className={cn(
            compact ? 'px-3 pb-3 pt-1' : 'px-6 pb-6 pt-2',
            scrollBody && 'flex min-h-0 flex-1 flex-col overflow-hidden',
          )}
        >
          {children}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Desktop variant: centered modal dialog ────────────────────────────────

interface DialogPanelProps {
  title?: string;
  maxWidth: string;
  fixedWidth: boolean;
  scrollBody: boolean;
  scrollBodyMaxHeightClass: string;
  reduceMotion: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function DialogPanel({
  title,
  maxWidth,
  fixedWidth,
  scrollBody,
  scrollBodyMaxHeightClass,
  reduceMotion,
  onClose,
  children,
}: DialogPanelProps) {
  // The flex host covers the full viewport *above* the scrim, so click-off
  // never reached the scrim's onClick. Dismiss here; stop inside the card.
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div
      className="absolute inset-0 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        onClick={stop}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 4 }}
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: 'spring', damping: 28, stiffness: 360, mass: 0.7 }
        }
        className={cn(
          'w-full overflow-hidden rounded-3xl border border-border-hairline bg-surface-card shadow-[0_24px_64px_-12px_rgba(0,0,0,0.25),0_0_0_1px_rgba(0,0,0,0.02)]',
          scrollBody && cn('flex min-h-0 flex-col', scrollBodyMaxHeightClass),
        )}
        style={{ maxWidth, width: fixedWidth ? `min(${maxWidth}, 100%)` : undefined }}
      >
        {title && (
          <div className="shrink-0 border-b border-border-hairline px-6 pt-5 pb-4 text-center">
            <h3 className="text-base font-semibold tracking-tight text-text-default">
              {title}
            </h3>
          </div>
        )}
        <div className={cn('px-6 py-5', scrollBody && 'flex min-h-0 flex-1 flex-col overflow-hidden')}>{children}</div>
      </motion.div>
    </div>
  );
}

// ─── Confirm sheet — replaces window.confirm ───────────────────────────────

interface ConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export function ConfirmSheet({
  open,
  onClose,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: ConfirmSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} dragDisabled={destructive} title={title}>
      {message && (
        <p className="mb-5 text-center text-sm leading-relaxed text-text-muted">
          {message}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:gap-3">
        {/* ds-raw-button: full-width gradient sheet CTA (h-12, blue/red gradient + shadow) — DS Button has no gradient variant */}
        <button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold tracking-wide text-white shadow-md transition-transform active:scale-[0.98] sm:flex-1 ${
            destructive
              ? 'bg-gradient-to-br from-red-500 to-red-700 shadow-red-500/30'
              : 'bg-gradient-to-br from-blue-500 to-blue-700 shadow-blue-600/30'
          }`}
        >
          {confirmLabel}
        </button>
        {/* ds-raw-button: full-width sheet cancel paired to the gradient CTA (h-12, equal flex) — kept consistent with its sibling */}
        <button
          type="button"
          onClick={onClose}
          className="flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold text-text-muted transition-colors hover:bg-surface-sunken sm:flex-1"
        >
          {cancelLabel}
        </button>
      </div>
    </BottomSheet>
  );
}

// ─── Prompt sheet — replaces window.prompt ─────────────────────────────────

interface PromptSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  /** Transform on commit, e.g. .toUpperCase() */
  transform?: (v: string) => string;
  onCommit: (value: string) => void;
}

export function PromptSheet({
  open,
  onClose,
  title,
  message,
  defaultValue = '',
  placeholder,
  confirmLabel = 'Save',
  transform,
  onCommit,
}: PromptSheetProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
  }, [open]);

  const commit = () => {
    const raw = inputRef.current?.value ?? '';
    const next = (transform ? transform(raw) : raw).trim();
    if (next) {
      onCommit(next);
      onClose();
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {message && (
        <p className="mb-3 text-center text-role-caption text-text-soft">{message}</p>
      )}
      <input
        ref={inputRef}
        type="text"
        defaultValue={defaultValue}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onClose();
        }}
        autoComplete="off"
        className={cn("mb-4 h-12 w-full rounded-2xl border border-border-default bg-surface-canvas px-4 text-sm font-semibold text-text-default transition-colors focus:bg-surface-card", focusRing('field', 'accent'))}
      />
      <div className="flex flex-col gap-2 sm:flex-row-reverse sm:gap-3">
        {/* ds-raw-button: full-width gradient sheet CTA (h-12, blue gradient + shadow) — DS Button has no gradient variant */}
        <button
          type="button"
          onClick={commit}
          className="flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 text-sm font-semibold tracking-wide text-white shadow-md shadow-blue-600/30 transition-transform active:scale-[0.98] sm:flex-1"
        >
          {confirmLabel}
        </button>
        {/* ds-raw-button: full-width sheet cancel paired to the gradient CTA (h-12, equal flex) — kept consistent with its sibling */}
        <button
          type="button"
          onClick={onClose}
          className="flex h-12 w-full items-center justify-center rounded-2xl text-sm font-semibold text-text-muted transition-colors hover:bg-surface-sunken sm:flex-1"
        >
          Cancel
        </button>
      </div>
    </BottomSheet>
  );
}
