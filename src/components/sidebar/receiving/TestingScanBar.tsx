'use client';

import { useRef, type FormEvent } from 'react';
import { Barcode, MapPin, Hash, Pencil } from '@/components/Icons';
import {
  StationScanModeRail,
  ThemedStationScanBar,
  useScanStance,
  useScanTypeKeybinds,
} from '@/components/station/scan-bar';
import { classifyInput } from '@/lib/scan-resolver';
import {
  looksLikeHandlingUnit,
  looksLikePoNumber,
  looksLikeReceivingRef,
  looksLikeUnitId,
  type ForcedTestingType,
} from '@/lib/testing/resolve-testing-scan';

export interface TestingScanModeMeta {
  mode: ForcedTestingType;
  label: string;
  Icon: typeof MapPin;
  armedClass: string;
  iconClass: string;
}

export const TESTING_SCAN_MODES: readonly TestingScanModeMeta[] = [
  {
    mode: 'tracking',
    label: 'Tracking',
    Icon: MapPin,
    armedClass: 'text-blue-700',
    iconClass: 'text-blue-600',
  },
  {
    mode: 'po',
    label: 'PO#',
    Icon: Hash,
    armedClass: 'text-text-muted', // ds-allow-raw-neutral: PO# hash tint among mode rail hues
    iconClass: 'text-text-soft',
  },
  {
    mode: 'serial',
    label: 'Serial',
    Icon: Barcode,
    armedClass: 'text-emerald-700',
    iconClass: 'text-emerald-600',
  },
  {
    mode: 'sku',
    label: 'SKU',
    Icon: Pencil,
    armedClass: 'text-yellow-700',
    iconClass: 'text-yellow-600',
  },
] as const;

/**
 * Display-only hint when the operator hasn't armed a mode.
 * Does NOT decide resolution — un-armed scans still auto-detect server-side.
 */
export function classifyTestingScan(value: string): ForcedTestingType {
  const v = value.trim();
  if (!v) return 'serial';
  if (looksLikePoNumber(v)) return 'po';
  if (
    looksLikeReceivingRef(v) ||
    looksLikeUnitId(v) ||
    looksLikeHandlingUnit(v)
  ) {
    return 'serial';
  }
  const classified = classifyInput(v);
  if (classified.type === 'tracking') return 'tracking';
  return 'serial';
}

export function testingScanModeMeta(mode: ForcedTestingType): TestingScanModeMeta {
  return TESTING_SCAN_MODES.find((m) => m.mode === mode) ?? TESTING_SCAN_MODES[2];
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  isResolving?: boolean;
  staffId?: string;
  armedMode?: ForcedTestingType | null;
  onToggleMode?: (mode: ForcedTestingType) => void;
}

export function TestingScanBar({
  value,
  onChange,
  onSubmit,
  isResolving = false,
  staffId,
  armedMode = null,
  onToggleMode,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const stance = useScanStance();
  useScanTypeKeybinds({
    modes: TESTING_SCAN_MODES.map((m) => m.mode),
    armedMode,
    onToggleMode,
    value,
    onChange,
  });

  const handleSubmit = (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    onSubmit();
  };

  const active = armedMode ? testingScanModeMeta(armedMode) : null;
  // The bar renders the value and the chrome — never a sentence, a status word
  // or a stance label. Preview leaves the placeholder EMPTY: naming the stance
  // in the field was the bar narrating itself.
  const placeholder =
    stance === 'preview'
      ? ''
      : armedMode
        ? `Scan ${active!.label}\u2026`
        : 'Tracking \u00b7 PO \u00b7 Serial \u00b7 SKU';

  return (
    <div data-testing-scan className="w-full">
      <ThemedStationScanBar
        value={value}
        onChange={onChange}
        onSubmit={handleSubmit}
        inputRef={inputRef}
        staffId={staffId}
        placeholder={placeholder}
        autoFocus
        // Align the scan icon/text to the recent rail's dot/title column below.
        leadingColumn="rail"
        isResolving={isResolving}
        rightContent={
          // The scan-TYPE picker belongs to scanning. In Preview the bar is a
          // find field, so arming a type for the NEXT SCAN is a control for
          // something this field is not about to do.
          stance === 'scan' ? (
            <StationScanModeRail
              modes={TESTING_SCAN_MODES}
              armedMode={armedMode}
              onToggleMode={onToggleMode}
              size="compact"
            />
          ) : undefined
        }
      />
    </div>
  );
}
