'use client';

import type { FormEvent, ReactNode, Ref } from 'react';
import { MapPin, Package, ScanBarcode, Settings } from '@/components/Icons';
import {
  StationScanModeRail,
  ThemedStationScanBar,
  useScanStance,
  type StationScanModeDefinition,
} from '@/components/station/scan-bar';
import { composeStationScanBarRightContent } from '@/components/station/scan-bar/station-scan-preview-rail';
import { type StationInputMode } from '@/lib/station-scan-routing';
import type { Order } from '@/components/station/upnext/upnext-types';

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
    Icon: ScanBarcode,
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
  /**
   * Recent-rail facet popover — mounted only in Preview (Unbox SoT). Typing
   * then filters the history rail instead of arming a scan.
   */
  filterSlot?: ReactNode;
  /**
   * Preview stance READ — resolve the value and open the station read-only.
   * Wired = Preview appears in the leading icon. Unwired = no stance.
   */
  previewLookup?: (value: string) => Promise<Order | null>;
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
  filterSlot,
  previewLookup,
}: Props) {
  const stance = useScanStance();
  const active = armedMode ? modeMeta(armedMode) : null;
  // The bar renders the value and the chrome — never a sentence, a status word
  // or a stance label. Preview leaves the placeholder EMPTY: naming the stance
  // in the field was the bar narrating itself.
  const placeholder =
    stance === 'preview'
      ? ''
      : armedMode
        ? `Scan ${active!.label}`
        : 'Orders \u00b7 Amz SKU \u00b7 Repair \u00b7 Serial';

  return (
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
      previewLookup={previewLookup}
      previewMode={armedMode ?? 'auto'}
      rightContent={composeStationScanBarRightContent(
        stance,
        filterSlot,
        <StationScanModeRail
          modes={SHIPPING_SCAN_MODES}
          armedMode={armedMode}
          onToggleMode={onToggleMode}
          size="compact"
          getTitle={(mode, armed) => {
            const full = mode.mode === 'fba' ? 'Amazon Prep' : mode.label;
            return armed
              ? `${full} armed \u2014 next Enter/scan. Click again to cancel.`
              : `${full} (next Enter/scan; or search now if the field has text)`;
          }}
          getAriaLabel={(mode, armed) => {
            const full = mode.mode === 'fba' ? 'Amazon Prep' : mode.label;
            return armed
              ? `${full} armed for next scan. Click again to cancel.`
              : `Arm ${full}: next Enter/scan searches ${full}.`;
          }}
        />,
      )}
    />
  );
}
