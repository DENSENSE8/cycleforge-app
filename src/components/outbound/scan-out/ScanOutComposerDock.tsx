'use client';

/**
 * Scan-out floor mouth — the **same** {@link StationComposerHost} Unbox uses
 * (OmnichannelComposerDock shell). Modes (Unbox | Ticket) stay off; the below-
 * outline row still paints with **only** the bottom-right context / procedure
 * ring — opens Displays so the operator can verify the carton.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { StationComposerHost } from '@/components/composer';
import { requestStationComposerFocus } from '@/components/composer/station-composer-focus';
import { Barcode, Check, AlertTriangle } from '@/components/Icons';
import { getLast8 } from '@/components/ui/CopyChip';
import { useAppendOrderNote } from '@/hooks/useOrderNotes';
import { useRegisterScanSink } from '@/lib/station-scan-sink';
import { isScanOutTrackingCommit } from '@/components/outbound/scan-out/scan-out-commit';
import {
  SCAN_OUT_DISPLAYS_CHANGED_EVENT,
  dispatchScanOutCloseDisplays,
  dispatchScanOutOpenDisplays,
} from '@/components/outbound/scan-out/scan-out-active';
import {
  useScanOutStation,
  useScanOutActivePane,
  type ActiveScanOut,
} from '@/components/outbound/scan-out/useScanOutStation';
import { FLOATING_DOCK_BOTTOM_PAD } from '@/design-system/tokens/dock-clearance';
import { cn } from '@/utils/_cn';

const FEEDBACK_TONE: Record<ActiveScanOut['status'], string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  dup: 'bg-amber-50 text-amber-700 ring-amber-200',
  exc: 'bg-amber-50 text-amber-700 ring-amber-200',
  blk: 'bg-surface-danger text-text-danger ring-border-danger',
  pending: 'bg-surface-canvas text-text-muted ring-border-soft',
  miss: 'bg-rose-50 text-rose-700 ring-rose-200',
  err: 'bg-rose-50 text-rose-700 ring-rose-200',
};

function ringProgressForStatus(status: ActiveScanOut['status'] | null): number {
  if (status === 'ok' || status === 'dup') return 100;
  if (status === 'pending') return 40;
  if (status === 'exc' || status === 'err' || status === 'miss' || status === 'blk') return 15;
  return 0;
}

export function ScanOutComposerDock({
  autoFocus = true,
  className,
}: {
  autoFocus?: boolean;
  className?: string;
} = {}) {
  const station = useScanOutStation();
  const activePane = useScanOutActivePane();
  const liveValueRef = useRef('');
  const [draft, setDraft] = useState('');
  const [displaysOpen, setDisplaysOpen] = useState(false);
  const noteOrderRowId =
    station.noteOrderRowId != null && station.noteOrderRowId > 0
      ? station.noteOrderRowId
      : 0;
  const canNote = noteOrderRowId > 0;
  const appendNote = useAppendOrderNote(noteOrderRowId);

  useEffect(() => {
    station.bindFocus(() => requestStationComposerFocus());
    return () => station.bindFocus(null);
  }, [station.bindFocus]);

  useEffect(() => {
    if (!autoFocus) return;
    requestAnimationFrame(() => requestStationComposerFocus());
  }, [autoFocus]);

  useEffect(() => {
    const onDisplays = (e: Event) => {
      const open = Boolean((e as CustomEvent<{ open?: boolean }>).detail?.open);
      setDisplaysOpen(open);
    };
    window.addEventListener(SCAN_OUT_DISPLAYS_CHANGED_EVENT, onDisplays);
    return () => window.removeEventListener(SCAN_OUT_DISPLAYS_CHANGED_EVENT, onDisplays);
  }, []);

  useRegisterScanSink({
    id: 'scan-out-composer',
    enabled: true,
    onScan: (value) => {
      setDraft('');
      liveValueRef.current = '';
      station.submitRaw(value);
    },
    focus: () => requestStationComposerFocus(),
  });

  const setDraftTracked = useCallback((next: string) => {
    liveValueRef.current = next;
    setDraft(next);
  }, []);

  const commitLive = useCallback(
    (raw?: string) => {
      const fromLive = raw ?? liveValueRef.current;
      const text = (fromLive || draft).trim();
      if (!text) return;

      if (isScanOutTrackingCommit(text)) {
        setDraft('');
        liveValueRef.current = '';
        station.submitRaw(text);
        return;
      }

      if (!canNote || appendNote.isPending) return;
      appendNote.mutate(text, {
        onSuccess: () => {
          setDraft('');
          liveValueRef.current = '';
        },
      });
    },
    [draft, canNote, appendNote, station],
  );

  const active = station.active;
  const label = active?.result?.orderId
    ? `#${getLast8(active.result.orderId)}`
    : active?.result?.tracking
      ? `…${getLast8(active.result.tracking)}`
      : '';
  const feedbackText =
    active?.status === 'ok' && active.result?.productTitle
      ? active.result.productTitle
      : (active?.text ?? '');

  const placeholder = canNote
    ? 'Scan next label, or note the last package…'
    : 'Scan label to ship out…';

  const livePreview = draft.trim();
  const trackingCommit = livePreview.length > 0 && isScanOutTrackingCommit(livePreview);
  const noteCommit = livePreview.length > 0 && !trackingCommit && canNote;
  const commitDisabled =
    livePreview.length === 0 ||
    (!trackingCommit && !noteCommit) ||
    (!trackingCommit && appendNote.isPending);

  const ringStatus =
    active?.status ??
    (activePane?.status === 'miss' ? null : activePane?.status) ??
    null;
  const progressPercent = ringProgressForStatus(ringStatus);
  const progressTone = displaysOpen ? 'selected' : 'idle';

  return (
    <div
      className={cn(
        'flex w-full min-w-0 flex-col gap-2 bg-surface-card',
        FLOATING_DOCK_BOTTOM_PAD,
        className,
      )}
      data-testid="scan-out-composer-dock"
    >
      {active ? (
        <div
          className={cn(
            'flex items-center gap-1.5 px-3 py-1 text-xs font-semibold ring-1 ring-inset',
            FEEDBACK_TONE[active.status],
          )}
        >
          {active.status === 'ok' ? (
            <Check className="h-3.5 w-3.5 shrink-0" />
          ) : active.status === 'pending' ? (
            <Barcode className="h-3.5 w-3.5 shrink-0 animate-pulse" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="min-w-0 flex-1 truncate">
            {feedbackText}
            {label ? ` — ${label}` : ''}
          </span>
          {active.status === 'ok' && station.undoable ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={station.undo}
              disabled={station.isUndoing}
              className="h-auto shrink-0 px-0 text-xs text-emerald-700 underline-offset-2 hover:text-emerald-800 hover:underline"
            >
              {station.isUndoing ? 'Undoing…' : 'Undo'}
            </Button>
          ) : null}
        </div>
      ) : null}

      <StationComposerHost
        showModeRow
        showModeFaces={false}
        labelValue={draft}
        onLabelChange={setDraftTracked}
        onLabelCommit={(live) => {
          if (live != null) liveValueRef.current = live;
          commitLive(live);
        }}
        labelCommitDisabled={commitDisabled}
        labelPlaceholder={placeholder}
        labelCommitAriaLabel={trackingCommit ? 'Ship out label' : 'Save note'}
        labelCommitTooltip={
          trackingCommit
            ? 'Ship out (Enter)'
            : canNote
              ? 'Save note for last package (Enter) · Shift+Enter for newline'
              : 'Scan a carrier label first'
        }
        chrome="raised"
        animateMount={false}
        progressPercent={progressPercent}
        progressTone={progressTone}
        onProgressClick={() => {
          if (displaysOpen) {
            dispatchScanOutCloseDisplays();
            return;
          }
          dispatchScanOutOpenDisplays();
        }}
      />
    </div>
  );
}
