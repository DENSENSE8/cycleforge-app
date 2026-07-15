'use client';

/**
 * Dock scan-out bar (sidebar) — scan a carrier label to record SHIP_CONFIRM.
 * The one scan target for scan-out mode; the main pane shows the staged queue.
 * Scan loop + undo live in `useScanOutStation`; this is the compact bar + a
 * one-line active result.
 */

import { StationScanBar } from '@/components/station/StationScanBar';
import { Button } from '@/design-system/primitives';
import { Barcode, Check, AlertTriangle } from '@/components/Icons';
import { getLast4 } from '@/components/ui/CopyChip';
import { useScanOutStation, type ActiveScanOut } from '@/components/outbound/scan-out/useScanOutStation';
import { cn } from '@/utils/_cn';

const FEEDBACK_TONE: Record<ActiveScanOut['status'], string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  dup: 'bg-amber-50 text-amber-700 ring-amber-200',
  exc: 'bg-amber-50 text-amber-700 ring-amber-200',
  miss: 'bg-rose-50 text-rose-700 ring-rose-200',
  err: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function ScanOutStationBar({ autoFocus = true }: { autoFocus?: boolean } = {}) {
  const station = useScanOutStation();
  const active = station.active;
  const label = active?.result?.orderId
    ? `#${getLast4(active.result.orderId)}`
    : active?.result?.tracking
      ? `…${getLast4(active.result.tracking)}`
      : '';
  const text =
    active?.status === 'ok' && active.result?.productTitle ? active.result.productTitle : active?.text ?? '';

  return (
    <div>
      {active ? (
        <div
          className={cn(
            'mb-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
            FEEDBACK_TONE[active.status],
          )}
        >
          {active.status === 'ok' ? (
            <Check className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">
            {text}
            {label ? ` — ${label}` : ''}
          </span>
          {active.status === 'ok' && station.undoable ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={station.undo}
              disabled={station.isUndoing}
              className="ml-auto h-auto shrink-0 px-0 text-xs text-emerald-700 underline-offset-2 hover:text-emerald-800 hover:underline"
            >
              {station.isUndoing ? 'Undoing…' : 'Undo'}
            </Button>
          ) : null}
        </div>
      ) : null}

      <StationScanBar
        value={station.scanValue}
        onChange={station.setScanValue}
        onSubmit={station.submit}
        inputRef={station.inputRef}
        autoFocus={autoFocus}
        placeholder="Scan label to ship out…"
        icon={<Barcode className="h-[17px] w-[17px]" />}
        iconClassName="text-emerald-600"
        inputBorderClassName="border-2 border-emerald-200"
        inputClassName="bg-surface-card focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-400"
        hasRightContent={false}
        onPaste={(text) => station.setScanValue(text)}
      />
    </div>
  );
}
