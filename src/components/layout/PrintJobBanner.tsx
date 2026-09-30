'use client';

/**
 * Print feedback, macOS-notification style — the ONLY place a print job is
 * shown (owner 2026-09-29: no header pill, no inline counter). The header's
 * {@link PrintJobOverlay} owns the state and mounts this once:
 *  - {@link PrintJobBanner} portals a stack of frosted cards under the top-right
 *    of the header — one per job, dropping in on a spring as it starts. Hover a
 *    card and a round × appears on its top-left corner (the macOS grammar);
 *    dismiss hides the card only — the job keeps printing and Sync's panel
 *    still lists it. A finished or cancelled job's card settles and leaves.
 *  - "+N more" opens one sheet of every print job, finished ones included,
 *    over a scrim on the page. Click the scrim or press Esc to close; focus
 *    goes back to what opened it.
 * {@link PrintJobRow} is one job, the same in a card, the sheet and Sync's
 * panel: glyph, what → where, the count, the bar, and Pause / Resume. Hover the
 * job and its printer glyph turns into a red stop — the one Cancel control.
 */

import { useEffect, useId, useRef, type RefObject } from 'react';
import { CirclePause, CircleStop, Play, Printer, X } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { AnimatePresence, motion, useReducedMotion } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import { useMotionPresence } from '@/design-system/foundations/motion-presets-hooks';
import { IconButton, Layer, ProgressBar } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cancelWork, isLiveWork, pauseWork, resumeWork, type WorkItem } from '@/lib/background-work/store';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import { HEADER_MENU_CAPTION_CLASS, TOP_CHROME_ROW_PX } from './header-shell';
import { printJobLine, printJobTitle, type PrintJobTone } from './print-job-line';

/** Cards shown at once; the rest fold into a "+N more" key that opens the sheet. */
const MAX_BANNERS = 3;

/** Frosted shade: a translucent surface over a backdrop blur, the overlay shadow, the region's corner. */
const BANNER_SURFACE = cn(
  'border border-border-hairline bg-surface-card/75 backdrop-blur-xl backdrop-saturate-150 rounded-mode',
  elevationClass('overlay'),
);

const TONE_TEXT: Record<PrintJobTone, string> = {
  accent: 'text-text-accent',
  muted: 'text-text-muted',
  success: 'text-text-success',
  danger: 'text-text-danger',
};

// ── One job ──────────────────────────────────────────────────────────────────

export function PrintJobRow({ item }: { item: WorkItem }) {
  const line = printJobLine(item);
  const title = printJobTitle(item);
  const live = isLiveWork(item.status);
  const total = item.total !== undefined && item.total > 0 ? item.total : null;
  const canPause = live && item.controls?.pause === true;
  const canCancel = live && item.controls?.cancel === true;

  return (
    <div className="group/job flex min-w-0 gap-3" data-testid="print-job-row" data-state={item.status}>
      {canCancel ? (
        // The job's own glyph IS its stop: hover (or focus) the job and the
        // printer turns into a red stop square in place — one control, no
        // second Cancel button competing for the same job.
        <HoverTooltip label="Stop printing" asChild>
          <button
            type="button"
            onClick={() => cancelWork(item.id)}
            aria-label={`Stop printing ${title}`}
            data-testid="print-job-cancel"
            className={cn(
              'ds-raw-button relative flex size-9 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-mode bg-surface-sunken',
              'transition-colors duration-150 group-hover/job:bg-fill-danger/10 group-has-[:focus-visible]/job:bg-fill-danger/10 motion-reduce:transition-none',
              focusRing('control', 'danger'),
            )}
          >
            <Printer
              className={cn(
                'size-4 transition-[opacity,transform] duration-150 group-hover/job:scale-75 group-hover/job:opacity-0 group-has-[:focus-visible]/job:opacity-0 motion-reduce:transition-none',
                TONE_TEXT[line.tone],
              )}
              aria-hidden
            />
            <CircleStop
              className="absolute size-4 scale-75 text-text-danger opacity-0 transition-[opacity,transform] duration-150 group-hover/job:scale-100 group-hover/job:opacity-100 group-has-[:focus-visible]/job:scale-100 group-has-[:focus-visible]/job:opacity-100 motion-reduce:transition-none"
              aria-hidden
            />
          </button>
        </HoverTooltip>
      ) : (
        <span
          className={cn('flex size-9 shrink-0 items-center justify-center rounded-mode bg-surface-sunken', TONE_TEXT[line.tone])}
          aria-hidden
        >
          <Printer className="size-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-role-body font-semibold text-text-default" title={title}>
              {title}
            </p>
            <p className={cn('truncate text-role-caption', line.tone === 'accent' ? 'text-text-muted' : TONE_TEXT[line.tone])} data-testid="print-job-line">
              {line.kind === 'count' ? (
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  {line.lead} <AnimatedStat value={line.done} profile="scanQuantity" /> of{' '}
                  <AnimatedStat value={line.total} profile="scanQuantity" />
                </span>
              ) : (
                line.text
              )}
            </p>
          </div>
          {canPause ? (
            item.status === 'paused' ? (
              <HoverTooltip label="Resume printing" asChild>
                <IconButton
                  size="sm"
                  radius="pill"
                  ariaLabel="Resume printing"
                  icon={<Play className="size-4" />}
                  onClick={() => resumeWork(item.id)}
                  data-testid="print-job-resume"
                />
              </HoverTooltip>
            ) : (
              <HoverTooltip label="Pause printing" asChild>
                <IconButton
                  size="sm"
                  radius="pill"
                  ariaLabel="Pause printing"
                  icon={<CirclePause className="size-4" />}
                  onClick={() => pauseWork(item.id)}
                  data-testid="print-job-pause"
                />
              </HoverTooltip>
            )
          ) : null}
        </div>
        {total !== null ? (
          <ProgressBar
            className="mt-2"
            current={item.done ?? 0}
            goal={total}
            showPercentage={false}
            showRemaining={false}
            variant={item.status === 'done' ? 'success' : item.status === 'running' ? 'default' : 'muted'}
            ariaLabel={`${title} — ${item.done ?? 0} of ${total} printed`}
          />
        ) : null}
      </div>
    </div>
  );
}

// ── The banner stack + the expanded sheet ────────────────────────────────────

export function PrintJobBanner({
  banners,
  jobs,
  expanded,
  onDismiss,
  onExpand,
  onClose,
  returnFocusRef,
}: {
  /** Jobs that still have a card (not dismissed, not settled away), newest first. */
  banners: readonly WorkItem[];
  /** Every print job in the record, for the sheet. */
  jobs: readonly WorkItem[];
  expanded: boolean;
  onDismiss: (item: WorkItem) => void;
  onExpand: () => void;
  onClose: () => void;
  /** What opened the sheet — focus returns there when it closes. */
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const reduce = useReducedMotion();
  const sheetId = useId();
  const card = useMotionPresence(motionPresence.printBanner);
  const sheet = useMotionPresence(motionPresence.printSheet);
  const scrim = motionPresence.workOrderScrim;
  const drop = reduce ? motionTransition.overlayScrim : motionTransition.printBannerDrop;
  const sheetRef = useRef<HTMLDivElement>(null);
  const shown = banners.slice(0, MAX_BANNERS);
  const more = banners.length - shown.length;

  // Esc reads the latest close without re-running the focus effect (which would refocus the sheet).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!expanded) return;
    sheetRef.current?.focus({ preventScroll: true });
    const back = returnFocusRef.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      back?.focus({ preventScroll: true });
    };
  }, [expanded, returnFocusRef]);

  return (
    <Layer level="banner" className="pointer-events-none fixed inset-0" data-testid="print-banner-layer">
      <AnimatePresence>
        {expanded ? (
          <motion.div
            key="scrim"
            className="pointer-events-auto absolute inset-x-0 bottom-0 bg-scrim/30"
            style={{ top: TOP_CHROME_ROW_PX }}
            initial={scrim.initial}
            animate={scrim.animate}
            exit={scrim.exit}
            transition={motionTransition.overlayScrim}
            onClick={onClose}
            aria-hidden
            data-testid="print-sheet-scrim"
          />
        ) : null}
      </AnimatePresence>

      <div className="absolute right-2 w-[360px] max-w-[calc(100vw-1rem)]" style={{ top: TOP_CHROME_ROW_PX + 8 }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {expanded ? (
            <motion.div
              key="sheet"
              ref={sheetRef}
              id={sheetId}
              role="dialog"
              aria-label="Print jobs"
              tabIndex={-1}
              className={cn(BANNER_SURFACE, 'pointer-events-auto origin-top-right overflow-hidden outline-none')}
              initial={sheet.initial}
              animate={sheet.animate}
              exit={sheet.exit}
              transition={drop}
              data-testid="print-sheet"
            >
              <div className="flex items-center justify-between py-2 pl-4 pr-2">
                <p className={HEADER_MENU_CAPTION_CLASS}>Print jobs</p>
                <IconButton size="sm" radius="pill" ariaLabel="Close print jobs" icon={<X className="size-4" />} onClick={onClose} />
              </div>
              {jobs.length > 0 ? (
                <ul className="max-h-[60vh] divide-y divide-border-hairline overflow-y-auto border-t border-border-hairline">
                  {jobs.map((item) => (
                    <li key={item.id} className="px-4 py-3">
                      <PrintJobRow item={item} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="border-t border-border-hairline px-4 py-6 text-role-caption text-text-muted">No print jobs in the last minute.</p>
              )}
            </motion.div>
          ) : (
            [
              ...shown.map((item) => (
                <motion.div
                  key={item.id}
                  layout={reduce ? false : 'position'}
                  className="group/banner pointer-events-auto relative mb-2 origin-top-right"
                  initial={card.initial}
                  animate={card.animate}
                  exit={card.exit}
                  transition={drop}
                  data-testid="print-banner"
                  data-state={item.status}
                >
                  <div className={cn(BANNER_SURFACE, 'p-3')}>
                    <PrintJobRow item={item} />
                  </div>
                  <IconButton
                    onClick={() => onDismiss(item)}
                    ariaLabel={`Dismiss ${printJobTitle(item)}`}
                    icon={<X className="size-3" />}
                    data-testid="print-banner-dismiss"
                    className={cn(
                      BANNER_SURFACE,
                      'absolute -left-2 -top-2 flex size-5 cursor-pointer items-center justify-center',
                      cornerClass('pill'),
                      'opacity-0 transition-opacity duration-150 focus-visible:opacity-100 group-hover/banner:opacity-100 group-has-[:focus-visible]/banner:opacity-100 motion-reduce:transition-none',
                    )}
                  />
                </motion.div>
              )),
              ...(more > 0
                ? [
                    <motion.button
                      key="more"
                      type="button"
                      layout={reduce ? false : 'position'}
                      onClick={onExpand}
                      aria-controls={sheetId}
                      className={cn(BANNER_SURFACE, 'ds-raw-button pointer-events-auto ml-auto flex cursor-pointer px-3 py-1 text-role-caption font-medium text-text-muted hover:text-text-default')}
                      initial={card.initial}
                      animate={card.animate}
                      exit={card.exit}
                      transition={drop}
                      data-testid="print-banner-more"
                    >
                      {more} more print {more === 1 ? 'job' : 'jobs'}
                    </motion.button>,
                  ]
                : []),
            ]
          )}
        </AnimatePresence>
      </div>
    </Layer>
  );
}
