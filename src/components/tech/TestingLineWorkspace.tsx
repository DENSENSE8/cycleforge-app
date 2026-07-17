'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  dispatchSelectLine,
  type ReceivingLineRow,
} from '@/components/station/ReceivingLinesTable';
import {
  readSelectLineDetail,
  type ReceivingSelectLineDetail,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { TestingPanel } from '@/components/tech/TestingPanel';
import { TestingWorkspaceView } from '@/components/tech/testing/TestingWorkspaceView';
import {
  framerPresence,
  framerTransition,
} from '@/design-system/foundations/motion-framer';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-framer-hooks';
import { zIndex } from '@/design-system/tokens/z-index';

/** Persisted last-open line — written on select for future session UX / e2e;
 *  not restored on cold load so Testing mode lands on the history browse. */
export const LAST_TESTING_LINE_KEY = 'cf:testing:last-line-id';

interface Props {
  staffId: string;
  /** When set, drives the rail-side highlighted line. */
  selectedLineId: number | null;
  onSelectedLineChange: (id: number | null) => void;
  /** Multi-select checkboxes on the history browse (when no line is open). */
  testingSelectMode?: boolean;
  onToggleTestingSelect: () => void;
  /** Non-select history row click — already navigates via `dispatchSelectLine`. */
  onOpenTestingLine?: () => void;
}

export function TestingLineWorkspace({
  staffId,
  onSelectedLineChange,
  testingSelectMode = false,
  onToggleTestingSelect,
  onOpenTestingLine,
}: Props) {
  const [row, setRow] = useState<ReceivingLineRow | null>(null);
  const lastSelectedRef = useRef<number | null>(null);
  const panePresence = useMotionPresence(framerPresence.workbenchPane);
  const paneTransition = useMotionTransition(framerTransition.workbenchPaneMount);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ReceivingSelectLineDetail>).detail;
      const { row: next } = readSelectLineDetail(detail);
      if (next) {
        setRow(next);
        onSelectedLineChange(next.id);
        lastSelectedRef.current = next.id;
        try {
          window.localStorage.setItem(LAST_TESTING_LINE_KEY, String(next.id));
        } catch {
          /* private mode / quota — non-fatal */
        }
      } else {
        setRow(null);
        onSelectedLineChange(null);
        lastSelectedRef.current = null;
      }
    };
    window.addEventListener('receiving-select-line', handler);
    return () => window.removeEventListener('receiving-select-line', handler);
  }, [onSelectedLineChange]);

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

  // No cold-load auto-restore — Testing mode lands on the history browse so
  // operators can pick a line (or scan). Selection still writes LAST_TESTING_LINE_KEY.

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-surface-canvas">
      <div
        className={`flex h-full min-h-0 w-full flex-col ${row ? 'pointer-events-none' : ''}`}
        aria-hidden={row ? true : undefined}
        inert={row ? true : undefined}
        style={{ visibility: row ? 'hidden' : 'visible' }}
      >
        <TestingWorkspaceView
          techId={staffId}
          selectMode={testingSelectMode}
          onToggleSelectMode={onToggleTestingSelect}
          onOpenLine={onOpenTestingLine}
        />
      </div>

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
