'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from '@/components/Icons';
import { AnimatePresence, motion } from '@/design-system/motion';
import { cn } from '@/utils/_cn';
import { AI_CARD_GLYPH_CLASS, AI_FOCUS_CLASS, AI_ICON_BUTTON_CLASS, AI_LABEL_CLASS, AI_PANEL_CLASS } from './classes';
import { aiPresence, aiTransition, useMotionPresence, useMotionTransition } from './motion';

export interface AiSidePanelProps {
  /** Something from the column is open in it. Closed = not rendered at all. */
  open: boolean;
  /**
   * Wide viewport: the panel docks beside the column (the column keeps its
   * width and re-centres). Narrow: it overlays the column over a scrim.
   */
  docked: boolean;
  onClose: () => void;
  title: string;
  /** "Table · 12 rows · via get_packing_kpi". */
  meta?: string | null;
  icon?: ReactNode;
  /** Changes when the panel switches to another item — the body crossfades. */
  contentKey: string;
  /** Header strip under the title (e.g. a stale-answer notice). */
  notice?: ReactNode;
  /** Header actions for the open item (Copy, Download CSV), placed before the ×. */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * AiSidePanel — the right-hand panel of an AI surface. It exists ONLY while
 * something from the column is open in it (an artifact card the operator
 * clicked, or one a live turn just produced — the surface decides). × and Esc
 * close it.
 *
 * Mount it as the LAST child of the surface's flex row: `AnimatePresence` pops
 * the exiting sheet out of flow, so the column re-centres while it slides out.
 */
export function AiSidePanel({ open, docked, onClose, title, meta, icon, contentKey, notice, actions, children }: AiSidePanelProps) {
  const panel = useMotionPresence(aiPresence.panel);
  const scrim = useMotionPresence(aiPresence.fade);
  const swap = useMotionPresence(aiPresence.swap);
  const panelTransition = useMotionTransition(aiTransition.panel);
  const fadeTransition = useMotionTransition(aiTransition.fade);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Esc closes (unless something inside already handled it); opening moves
  // focus into the panel and closing hands it back to whatever opened it.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus({ preventScroll: true });
    };
  }, [open, onClose]);

  const sheet = (
    <div className={cn(AI_PANEL_CLASS, 'flex h-full w-full min-w-0 flex-col overflow-hidden')}>
      <div className="flex shrink-0 items-center gap-3 border-b border-ai-line py-3 pl-4 pr-3">
        {icon ? (
          <span className={AI_CARD_GLYPH_CLASS} aria-hidden>
            {icon}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-ai-title text-ai-ink">{title}</h2>
          {meta ? <p className={cn(AI_LABEL_CLASS, 'truncate')}>{meta}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          title="Close (Esc)"
          className={cn('ds-raw-button', AI_ICON_BUTTON_CLASS, AI_FOCUS_CLASS)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {notice}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={contentKey}
          {...swap}
          transition={fadeTransition}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {open && !docked ? (
        <motion.div
          key="ai-panel-scrim"
          {...scrim}
          transition={fadeTransition}
          onClick={onClose}
          aria-hidden
          className="absolute inset-0 z-panelBackdrop bg-ai-scrim"
        />
      ) : null}
      {open ? (
        <motion.aside
          key={docked ? 'ai-panel-docked' : 'ai-panel-overlay'}
          {...panel}
          transition={panelTransition}
          aria-label={title}
          data-ai-side-panel={docked ? 'docked' : 'overlay'}
          className={
            docked
              ? 'flex h-full w-ai-panel shrink-0 py-3 pr-3'
              : 'absolute inset-y-0 right-0 z-panel flex w-full max-w-xl p-3'
          }
        >
          {sheet}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
