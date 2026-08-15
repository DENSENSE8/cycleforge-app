'use client';

import type { FormEvent, Ref } from 'react';
import { Barcode, MapPin, Package, Settings } from '@/components/Icons';
import {
  StationScanModeRail,
  ThemedStationScanBar,
  useScanStance,
  type StationScanModeDefinition,
} from '@/components/station/scan-bar';
import { type StationInputMode } from '@/lib/station-scan-routing';

interface ShippingScanModeMeta extends StationScanModeDefinition<StationInputMode> {
  iconClass: string;
}

/** Shared mode rail for Shipping / legacy StationTesting — one chrome, one palette. */
const SHIPPING_SCAN_MODES: readonly ShippingScanModeMeta[] = [
  {
    mode: 'tracking',
    label: 'Tracking',
    Icon: MapPin,
    armedClass: 'text-blue-700',
    iconClass: 'text-blue-600',
  },
  {
    mode: 'fba',
    // Dense scan-bar mark — page / nav face stays "Amazon Prep".
    label: 'Amz Prep',
    Icon: Package,
    armedClass: 'text-violet-700',
    iconClass: 'text-violet-600',
  },
  {
    mode: 'repair',
    label: 'Repair',
    Icon: Settings,
    armedClass: 'text-amber-700',
    iconClass: 'text-amber-600',
  },
  {
    mode: 'serial',
    label: 'Serial',
    Icon: Barcode,
    armedClass: 'text-emerald-700',
    iconClass: 'text-emerald-600',
  },
] as const;

function modeMeta(mode: StationInputMode): ShippingScanModeMeta {
  return SHIPPING_SCAN_MODES.find((m) => m.mode === mode) ?? SHIPPING_SCAN_MODES[0];
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
  inputRef?: Ref<HTMLInputElement>;
  staffId?: string | number | null;
  isResolving?: boolean;
  /** Armed override; null = auto-detect. */
  armedMode?: StationInputMode | null;
  onToggleMode?: (mode: StationInputMode) => void;
  /**
   * Fallback mode when the field is empty and un-armed (e.g. serial while an
   * order is active). Defaults to tracking.
   */
  idleFallbackMode?: StationInputMode;
}

/**
 * Shipping station scan chrome — {@link ThemedStationScanBar} + shared mode
 * rail. Domain submit / arm logic stays in the band or StationTesting.
 */
export function ShippingScanBar({
  value,
  onChange,
  onSubmit,
  inputRef,
  staffId,
  isResolving = false,
  armedMode = null,
  onToggleMode,
  idleFallbackMode: _idleFallbackMode = 'tracking',
}: Props) {
  const stance = useScanStance();
  const active = armedMode ? modeMeta(armedMode) : null;
  const typeLabel = active?.label ?? 'Auto';

  return (
    <ThemedStationScanBar
      value={value}
      onChange={onChange}
      onSubmit={onSubmit}
      inputRef={inputRef}
      staffId={staffId}
      placeholder={stance === 'preview'
        ? `Preview: would search ${typeLabel}`
        : armedMode
          ? `Scan ${active!.label}`
          : 'Orders \u00b7 Amz SKU \u00b7 Repair \u00b7 Serial'}
      autoFocus
      className="w-full"
      // Align the scan icon/text to the recent rail's dot/title column below.
      leadingColumn="rail"
      isResolving={isResolving}
      rightContent={
        <StationScanModeRail
          modes={SHIPPING_SCAN_MODES}
          armedMode={armedMode}
          onToggleMode={onToggleMode}
          size="compact"
          getTitle={(mode, armed) => {
            const full = mode.mode === 'fba' ? 'Amazon Prep' : mode.label;
            return armed
              ? `${full} armed — next Enter/scan. Click again to cancel.`
              : `${full} (next Enter/scan; or search now if the field has text)`;
          }}
          getAriaLabel={(mode, armed) => {
            const full = mode.mode === 'fba' ? 'Amazon Prep' : mode.label;
            return armed
              ? `${full} armed for next scan. Click again to cancel.`
              : `Arm ${full}: next Enter/scan searches ${full}.`;
          }}
        />
      }
    />
  );
}
