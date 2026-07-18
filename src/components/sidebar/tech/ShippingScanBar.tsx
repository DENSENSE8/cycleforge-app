'use client';

import type { FormEvent, Ref } from 'react';
import { Barcode, MapPin, Package, Settings } from '@/components/Icons';
import {
  StationScanLeadingIcon,
  StationScanModeRail,
  ThemedStationScanBar,
  type StationScanModeDefinition,
} from '@/components/station/scan-bar';
import {
  getStationInputMode,
  type StationInputMode,
} from '@/lib/station-scan-routing';

interface ShippingScanModeMeta extends StationScanModeDefinition<StationInputMode> {
  iconClass: string;
}

/** Shared mode rail for Shipping / legacy StationTesting — one chrome, one palette. */
const SHIPPING_SCAN_MODES: readonly ShippingScanModeMeta[] = [
  {
    mode: 'tracking',
    label: 'Tracking',
    Icon: MapPin,
    armedClass: 'text-blue-700 bg-blue-500/10',
    iconClass: 'text-blue-600',
  },
  {
    mode: 'fba',
    label: 'FBA',
    Icon: Package,
    armedClass: 'text-violet-700 bg-violet-500/10',
    iconClass: 'text-violet-600',
  },
  {
    mode: 'repair',
    label: 'Repair',
    Icon: Settings,
    armedClass: 'text-amber-700 bg-amber-500/10',
    iconClass: 'text-amber-600',
  },
  {
    mode: 'serial',
    label: 'Serial',
    Icon: Barcode,
    armedClass: 'text-emerald-700 bg-emerald-500/10',
    iconClass: 'text-emerald-600',
  },
] as const;

function modeMeta(mode: StationInputMode): ShippingScanModeMeta {
  return SHIPPING_SCAN_MODES.find((m) => m.mode === mode) ?? SHIPPING_SCAN_MODES[0];
}

/**
 * Display-only hint when the operator hasn't armed a mode.
 * Does NOT decide resolution — un-armed scans still auto-detect.
 */
function classifyShippingScan(
  value: string,
  fallback: StationInputMode = 'tracking',
): StationInputMode {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return getStationInputMode(trimmed);
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
  idleFallbackMode = 'tracking',
}: Props) {
  const effective: StationInputMode =
    armedMode ?? classifyShippingScan(value, idleFallbackMode);
  const active = modeMeta(effective);
  const ActiveIcon = active.Icon;
  // Un-armed: neutral scan glyph — mode lives in the right rail only.
  const LeadingIcon = armedMode ? ActiveIcon : Barcode;
  const leadingTint = armedMode ? active.iconClass : 'text-text-faint';

  return (
    <ThemedStationScanBar
      value={value}
      onChange={onChange}
      onSubmit={onSubmit}
      inputRef={inputRef}
      staffId={staffId}
      placeholder={armedMode ? `Scan ${active.label}` : 'Orders · FNSKU · RS · Serial'}
      autoFocus
      className="w-full"
      rightPadClass="pr-40"
      isResolving={isResolving}
      icon={
        <StationScanLeadingIcon
          Icon={LeadingIcon}
          tintClassName={leadingTint}
          ariaLabel={
            armedMode
              ? `Armed: ${active.label}`
              : 'Auto-detect — tracking, FBA, repair, or serial'
          }
          title={
            armedMode
              ? `Next scan forced to ${active.label}. Click the mode again to auto-detect.`
              : 'Auto-detect — pick a route on the right to force the next scan'
          }
        />
      }
      rightContent={
        <StationScanModeRail
          modes={SHIPPING_SCAN_MODES}
          armedMode={armedMode}
          onToggleMode={onToggleMode}
          size="compact"
        />
      }
    />
  );
}
