'use client';

/**
 * Receiving-domain scan-band wrappers for the receiving sidebar.
 *
 * Shared flush band chrome lives in {@link ScanBandShell}
 * (`@/components/station/scan-bar`). `TriageScanBand` is the tracking-only
 * entry used by the Receiving (triage) surface; `UnboxScanBand` is the
 * mode-toggling entry used by Unbox. Both are thin: they own no scan logic —
 * submit/value are handed down from the panel's scan hook.
 */

import {
  ScanBandShell,
  ThemedStationScanBar,
  STATION_SCAN_BAR_SESSION_CAPTURE_BOTTOM_RULE_CLASS,
} from '@/components/station/scan-bar';
import {
  ReceivingUnboxScanBar,
  type UnboxScanMode,
} from '@/components/sidebar/receiving/ReceivingUnboxScanBar';
import type { StationTheme } from '@/hooks/useStationTheme';

interface TriageScanBandProps {
  themeColor: StationTheme;
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  inputRef: React.Ref<HTMLInputElement>;
  staffId?: string | number | null;
  isResolving: boolean;
  /**
   * Session capture mode (CMD-BATCH-SORT). Amber rule + mode chip; placeholder
   * reflects batch size. Purely transient — parent owns the session state.
   */
  batchSortArmed?: boolean;
  batchCount?: number;
}

/**
 * Tracking-only scan entry for the Receiving (triage) surface — no
 * Tracking#/PO# mode toggle. Submit runs lookup-po (default) or the Arrival
 * batch-sort traffic cop when {@link batchSortArmed}.
 */
export function TriageScanBand({
  themeColor,
  value,
  onChange,
  onSubmit,
  inputRef,
  staffId,
  isResolving,
  batchSortArmed = false,
  batchCount = 0,
}: TriageScanBandProps) {
  const placeholder = batchSortArmed
    ? batchCount > 0
      ? `Scan shelf to commit · ${batchCount} in batch`
      : 'Scan tracking to batch…'
    : 'Scan tracking #';

  return (
    <ScanBandShell themeColor={themeColor}>
      <ThemedStationScanBar
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        inputRef={inputRef}
        staffId={staffId}
        placeholder={placeholder}
        autoFocus
        className="w-full"
        // Align the scan icon/text to the recent rail's dot/title column below.
        leadingColumn="rail"
        isResolving={isResolving}
        inputBorderClassName={
          batchSortArmed ? STATION_SCAN_BAR_SESSION_CAPTURE_BOTTOM_RULE_CLASS : undefined
        }
        rightPadClass={batchSortArmed ? 'pr-24' : undefined}
        rightContent={
          batchSortArmed ? (
            <span
              className="flex h-full shrink-0 items-center justify-center px-2 text-role-caption font-semibold uppercase tracking-wide text-amber-800"
              aria-live="polite"
            >
              Batch sort
            </span>
          ) : undefined
        }
      />
    </ScanBandShell>
  );
}

interface UnboxScanBandProps {
  themeColor: StationTheme;
  value: string;
  onChange: (next: string) => void;
  onSubmit: (mode: UnboxScanMode | 'auto') => void;
  inputRef: React.Ref<HTMLInputElement>;
  isResolving: boolean;
  staffId: string;
  armedMode: UnboxScanMode | null;
  onToggleMode: (mode: UnboxScanMode) => void;
}

/** Mode-toggling scan entry for the Unbox workspace. */
export function UnboxScanBand({
  themeColor,
  value,
  onChange,
  onSubmit,
  inputRef,
  isResolving,
  staffId,
  armedMode,
  onToggleMode,
}: UnboxScanBandProps) {
  return (
    <ScanBandShell themeColor={themeColor}>
      <ReceivingUnboxScanBar
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        inputRef={inputRef}
        isResolving={isResolving}
        staffId={staffId}
        armedMode={armedMode}
        onToggleMode={onToggleMode}
      />
    </ScanBandShell>
  );
}

interface PickupScanBandProps {
  themeColor: StationTheme;
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  inputRef: React.Ref<HTMLInputElement>;
  staffId?: string | number | null;
  isResolving?: boolean;
}

/**
 * Open/match scan entry for Local Pickup — resolve an LCPU order by PO #,
 * customer, or order id. Create stays on the workbench New Pickup CTA.
 */
export function PickupScanBand({
  themeColor,
  value,
  onChange,
  onSubmit,
  inputRef,
  staffId,
  isResolving = false,
}: PickupScanBandProps) {
  return (
    <ScanBandShell themeColor={themeColor}>
      <ThemedStationScanBar
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        inputRef={inputRef}
        staffId={staffId}
        placeholder="Scan PO # or customer…"
        autoFocus
        className="w-full"
        leadingColumn="rail"
        isResolving={isResolving}
      />
    </ScanBandShell>
  );
}
