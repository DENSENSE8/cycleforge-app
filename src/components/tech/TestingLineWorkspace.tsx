'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, motionRole, useMotionRole } from '@/design-system/motion';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import {
  readSelectLineDetail,
  type ReceivingSelectLineDetail,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { TestingPanel } from '@/components/tech/TestingPanel';
import { recordTestingLineOpen } from '@/lib/testing/record-testing-line-open';
import { TestingScanPickPanel } from '@/components/tech/testing/TestingScanPickPanel';
import { ScanStationIdleCanvas } from '@/components/station/ScanStationIdleCanvas';
import {
  publishTestingScanPick,
  resolveTestingScanPick,
  useTestingScanPick,
} from '@/lib/testing/testing-scan-session-bridge';

import { zIndex } from '@/design-system/tokens/z-index';

/** Persisted last-open line — written on select for future session UX / e2e;
 *  not restored on cold load so Quality Control lands on its idle stage. */
const LAST_TESTING_LINE_KEY = 'cf:testing:last-line-id';

interface Props {
  staffId: string;
}

export function TestingLineWorkspace({
  staffId,
}: Props) {
  const [row, setRow] = useState<ReceivingLineRow | null>(null);
  // An ambiguous scan (several serial / SKU / PO matches) parks its candidates
  // here. The scan column raises them; the middle is where the operator decides,
  // because the choice IS the active entity (display/station.md §11).
  const pick = useTestingScanPick();
  const lastSelectedRef = useRef<number | null>(null);
  // `motionRole.swap.focus` — the pointer-driven focus-surface swap, taken as
  // one pair so the presence can never drift onto another job's timing.
  const { presence: panePresence, transition: paneTransition } = useMotionRole(motionRole.swap.focus);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ReceivingSelectLineDetail>).detail;
      const { row: next } = readSelectLineDetail(detail);
      if (next) {
        setRow(next);
        lastSelectedRef.current = next.id;
        recordTestingLineOpen(next.id, next.receiving_id);
        try {
          window.localStorage.setItem(LAST_TESTING_LINE_KEY, String(next.id));
        } catch {
          /* private mode / quota — non-fatal */
        }
      } else {
        setRow(null);
        lastSelectedRef.current = null;
      }
    };
    window.addEventListener('receiving-select-line', handler);
    return () => window.removeEventListener('receiving-select-line', handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const patch = (event as CustomEvent<Partial<ReceivingLineRow>>).detail;
      if (!patch || typeof patch.id !== 'number') return;
      setRow((current) =>
        current && current.id === patch.id
          ? ({ ...current, ...patch } as ReceivingLineRow)
          : current,
      );
    };
    window.addEventListener('receiving-line-updated', handler);
    return () => window.removeEventListener('receiving-line-updated', handler);
  }, []);

  // No cold-load auto-restore — Quality Control lands on the station canvas.
  // Operators scan or choose a recent line from the contextual rail.

  // The pick covers the browse the same way an open line does, and an open line
  // outranks it — resolving a pick opens a line, so the two are never both live
  // for the same scan.
  const showPick = pick != null && row == null;

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-surface-canvas">
      <div
        className={`flex h-full min-h-0 w-full flex-col ${row || showPick ? 'pointer-events-none' : ''}`}
        aria-hidden={row || showPick ? true : undefined}
        inert={row || showPick ? true : undefined}
        style={{ visibility: row || showPick ? 'hidden' : 'visible' }}
      >
        <ScanStationIdleCanvas />
      </div>

      <AnimatePresence initial={false} mode="wait">
        {showPick && pick ? (
          <motion.div
            key="testing-scan-pick"
            initial={panePresence.initial}
            animate={panePresence.animate}
            exit={panePresence.exit}
            transition={paneTransition}
            style={{ zIndex: zIndex.panel }}
            className="absolute inset-0 flex min-h-0 flex-col bg-surface-card"
          >
            <TestingScanPickPanel
              pick={pick}
              onPick={(picked) => resolveTestingScanPick(picked)}
              onCancel={() => publishTestingScanPick(null)}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence initial={false} mode="wait">
        {row ? (
          <motion.div
            key={`testing-workspace-${row.id}`}
            initial={panePresence.initial}
            animate={panePresence.animate}
            exit={panePresence.exit}
            transition={paneTransition}
            style={{ zIndex: zIndex.panel }}
            className="absolute inset-0 flex min-h-0 flex-col bg-surface-card"
          >
            <TestingPanel
              row={row}
              staffId={staffId}
              onBackToBrowse={() => {
                try {
                  window.localStorage.removeItem(LAST_TESTING_LINE_KEY);
                } catch {
                  /* non-fatal */
                }
                dispatchSelectLine(null);
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
