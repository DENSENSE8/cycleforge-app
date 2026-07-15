'use client';

import { useEffect, useRef, useState } from 'react';
import {
  dispatchSelectLine,
  type ReceivingLineRow,
} from '@/components/station/ReceivingLinesTable';
import {
  readSelectLineDetail,
  type ReceivingSelectLineDetail,
} from '@/components/sidebar/receiving/receiving-sidebar-shared';
import { TestingHistoryList } from '@/components/tech/TestingHistoryList';
import { TestingPanel } from '@/components/tech/TestingPanel';

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
  /** Non-select history row click — already navigates via `dispatchSelectLine`. */
  onOpenTestingLine?: () => void;
}

export function TestingLineWorkspace({
  staffId,
  onSelectedLineChange,
  testingSelectMode = false,
  onOpenTestingLine,
}: Props) {
  const [row, setRow] = useState<ReceivingLineRow | null>(null);
  const lastSelectedRef = useRef<number | null>(null);

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

  if (!row) {
    return (
      <div className="flex h-full min-w-0 flex-col overflow-hidden bg-surface-card">
        <div className="flex shrink-0 items-center gap-2 border-b border-border-soft px-4 py-2.5">
          <p className="text-role-eyebrow font-bold uppercase tracking-widest text-text-faint">
            Your tested lines
          </p>
          <p className="text-role-caption text-text-soft">
            Pick a line to open the testing workspace, or scan from the sidebar.
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <TestingHistoryList
            staffId={staffId}
            selectMode={testingSelectMode}
            onOpenLine={() => {
              onOpenTestingLine?.();
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <TestingPanel
      key={row.id}
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
  );
}
