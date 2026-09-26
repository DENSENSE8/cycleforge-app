'use client';

/**
 * KioskPaneForm — THE frame every kiosk center pane wears.
 *
 *   [ optional step band ]   ← X + segments + n/N, or nothing at all
 *   [ scrolling body      ]   ← one fixed measure, or a full-height hero
 *   [ action floor        ]   ← the pane's keys
 *
 * Phase 1 of the kiosk DS unification. Repair, Buyback and Pickup each carried
 * their own copy of this shape (`flex h-full flex-col` → `min-h-0 flex-1
 * overflow-y-auto` → a footer row), which is how they drifted: the repair
 * footer lost its hairline, the pickup "collected" state grew a second copy of
 * the frame, and the header was a per-pane `hideHeader` boolean.
 *
 * ## There is deliberately NO title face
 *
 * The double-band bug (two stacked chromes on the pickup screen, 2026-09-14)
 * was possible because a pane could paint its own title while the shell was
 * already painting one. A frame that cannot render a title cannot stack. So:
 *
 *   - `progress` present → this pane owns its header and it is the step band
 *     ({@link StepProgressHeader}: X left, segments, n/N right).
 *   - `progress` absent → the SHELL painted the header above this pane. The
 *     pane paints nothing. That is the `hideHeader` case, now the default.
 *
 * ## The footer face follows the header, not a flag
 *
 * A step flow is a clean column with no dividers — its key floats (repair).
 * A shell-titled pane is banded top and bottom, so its floor carries the
 * matching hairline (buyback / pickup / cart). One rule, no knob, so the two
 * cannot disagree per pane again.
 *
 * ## The floor rides above the OS keyboard
 *
 * iPad Safari lays its keyboard OVER the page without resizing it, so a floor
 * pinned to the pane's bottom sat under the keys and Continue was unreachable
 * mid-form (operator 2026-09-24: "the continue button is behind the
 * keyboard"). The floor takes the obscured band ({@link useKeyboard}) as a
 * bottom margin: the scroll body shrinks and the keys stay in sight.
 *
 * ## The dock sits on the floor
 *
 *   [ scrolling body ]
 *   [ dock           ]   ← empty until a body control mounts a pad into it
 *   [ action floor   ]
 *
 * A body control that needs a thumb-zone surface (the Contact step's phone
 * keypad, {@link KioskFloatingPhoneKeypad}) portals it into the dock through
 * {@link useKioskPaneDock}. The dock is in flow ABOVE the floor, so the pad can
 * never cover the step's Continue: mounting it shrinks the scroll body, and
 * the floor does not move. Empty, the dock is zero height.
 *
 * Callers: `KioskRepairPane`, `KioskCartLedger`, `KioskCartDoneFace`;
 * `useKioskPaneDock` ← `KioskFloatingPhoneKeypad`.
 * Affected API: none. Schemas: none.
 * User: "extract the pane frame" (kiosk DS unification Phase 1).
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

export interface KioskPaneProgress {
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
