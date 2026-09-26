'use client';

/**
 * KioskPaneForm — THE frame every kiosk center pane wears.
 * mid-form (operator 2026-09-24: "the continue button is behind the
 */

import { createContext, useContext, useState, type ReactNode } from 'react';
import { useKeyboard } from '@/hooks/useKeyboard';
import { StepProgressHeader } from '@/design-system/primitives/StepProgressHeader';
import { KIOSK_PANE_FOOTER_BAND } from '@/app/kiosk/kiosk-chrome';
import { KIOSK_POS_FORM_MEASURE } from '@/app/kiosk/kiosk-pos-surface';
import { cn } from '@/utils/_cn';

const KioskPaneDockContext = createContext<HTMLElement | null>(null);

/** The pane's dock element (above the action floor), or null outside a pane. */
export function useKioskPaneDock(): HTMLElement | null {
  return useContext(KioskPaneDockContext);
}

interface KioskPaneProgress {
  /** COMPLETED units, never the index of the step in view (PG6). */
  current: number;
  /** Total units — also the segment count. */
  total: number;
  /** X, top-left — exits the flow. */
  onClose: () => void;
  closeLabel?: string;
  /** Accessible name for the progress region. */
  label?: string;
}

export function KioskPaneForm({
  testId,
  progress,
  measure = 'plain',
  hero,
  footer,
  children,
}: {
  /** `data-testid` on the pane root — the handle every kiosk e2e already uses. */
  testId: string;
  /** Step band. Omit when the shell painted the header (see the note above). */
  progress?: KioskPaneProgress;
  /**
   * How the body stacks inside the measure.
   * `divided` = hairline-separated `<section>`s (buyback / pickup forms).
   * `plain`   = the body owns its own rhythm (repair's step bodies).
   */
  measure?: 'plain' | 'divided';
  /**
   * Full-height state that REPLACES the scroll body — a done/empty face
   * ("Ready to hand over", "No product selected"), never a third band.
   */
  hero?: ReactNode;
  /** Action floor content. Omitted → no floor is rendered at all. */
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const { keyboardHeight } = useKeyboard();
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  return (
    <KioskPaneDockContext.Provider value={dock}>
      <div className="flex h-full flex-col" data-testid={testId}>
        {progress ? (
          <StepProgressHeader
            current={progress.current}
            total={progress.total}
            onClose={progress.onClose}
            closeLabel={progress.closeLabel}
            label={progress.label}
          />
        ) : null}

        {hero ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
            {hero}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div
              className={cn(
                'w-full',
                KIOSK_POS_FORM_MEASURE,
                measure === 'divided' && 'flex flex-col divide-y divide-border-hairline',
              )}
            >
              {children}
            </div>
          </div>
        )}

        <div ref={setDock} className="shrink-0" data-kiosk-pane-dock />

        {footer ? (
          <div
            className={cn(
              // Step flows float their key; shell-titled panes carry the floor
              // hairline. Derived from `progress`, never a per-pane flag.
              !progress && KIOSK_PANE_FOOTER_BAND,
              'flex flex-wrap items-center justify-center gap-2 px-4 py-4',
            )}
            data-kiosk-footer-band
            style={keyboardHeight > 0 ? { marginBottom: keyboardHeight } : undefined}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </KioskPaneDockContext.Provider>
  );
}
