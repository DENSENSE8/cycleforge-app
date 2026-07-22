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

import { ScanBandShell, ThemedStationScanBar } from '@/components/station/scan-bar';
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
}

/**
 * Tracking-only scan entry for the Receiving (triage) surface — no
 * Tracking#/PO# mode toggle. The input doubles as the live rail filter; submit
 * runs the same lookup-po flow as Unbox.
 */
export function TriageScanBand({
  themeColor,
  value,
  onChange,
  onSubmit,
  inputRef,
  staffId,
  isResolving,
}: TriageScanBandProps) {
  return (
    <ScanBandShell themeColor={themeColor}>
      <ThemedStationScanBar
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        inputRef={inputRef}
        staffId={staffId}
        placeholder="Scan tracking #"
        autoFocus
        className="w-full"
        // Align the scan icon/text to the recent rail's dot/title column below.
        leadingColumn="rail"
        isResolving={isResolving}
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
