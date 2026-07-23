'use client';

/**
 * Dock scan-out bar (sidebar) — scan a carrier label to record SHIP_CONFIRM.
 * The one scan target for scan-out mode; the main pane shows the staged queue.
 * Scan loop + undo live in `useScanOutStation`; this is the compact bar + a
 * one-line active result.
 */

import { ThemedStationScanBar } from '@/components/station/scan-bar';
import { ScanBandShell } from '@/components/station/scan-bar';
import { Button } from '@/design-system/primitives';
import { Barcode, Check, AlertTriangle } from '@/components/Icons';
import { getLast4 } from '@/components/ui/CopyChip';
import { useScanOutStation, type ActiveScanOut } from '@/components/outbound/scan-out/useScanOutStation';
import { useAuth } from '@/contexts/AuthContext';
import { useStationTheme } from '@/hooks/useStationTheme';
import { SIDEBAR_GUTTER } from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';

const FEEDBACK_TONE: Record<ActiveScanOut['status'], string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  dup: 'bg-amber-50 text-amber-700 ring-amber-200',
  exc: 'bg-amber-50 text-amber-700 ring-amber-200',
  miss: 'bg-rose-50 text-rose-700 ring-rose-200',
  err: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function ScanOutStationBar({ autoFocus = true }: { autoFocus?: boolean } = {}) {
  const { user } = useAuth();
  const { theme: themeColor } = useStationTheme({ staffId: user?.staffId ?? 0 });
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
    <div className="min-w-0 shrink-0">
      {active ? (
        <div
          className={cn(
            `${SIDEBAR_GUTTER} mb-0 flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold`,
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

      <ScanBandShell themeColor={themeColor}>
        <ThemedStationScanBar
          value={station.scanValue}
          onChange={station.setScanValue}
          onSubmit={station.submit}
          inputRef={station.inputRef}
          staffId={user?.staffId}
          autoFocus={autoFocus}
          placeholder="Scan label to ship out…"
          icon={<Barcode className="h-[17px] w-[17px]" />}
          iconClassName="text-emerald-600"
          // Align to SIDEBAR_SCAN_DOCK_LEADING_ROW (Unbox/Testing SoT) — not MasterNav deep inset.
          leadingColumn="rail"
          // Confirm-bench accent: emerald bottom rule + submit trace.
          inputBorderClassName="border-0 border-b-2 border-b-emerald-500"
          submitTraceClassName="bg-emerald-500"
          inputClassName="bg-surface-card"
          hasRightContent={false}
          onPaste={(text) => station.setScanValue(text)}
          className="w-full"
        />
      </ScanBandShell>
    </div>
  );
}
