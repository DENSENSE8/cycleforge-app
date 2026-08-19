'use client';

import { useRef, type FormEvent, type ReactNode, type Ref } from 'react';
import { MapPin, Hash, TicketHelp } from '@/components/Icons';
import {
  StationScanModeRail,
  ThemedStationScanBar,
  useScanStance,
  useScanTypeKeybinds,
} from '@/components/station/scan-bar';
// From the light scan-parser module — importing via lib/support/tickets drags
// the server-only tenancy/db (Neon driver) into this client bundle.
import { looksLikeTicketScan } from '@/lib/support/ticket-scan';
import type { UnboxPreviewHit } from '@/lib/receiving/preview-scan';

export type UnboxScanMode = 'ticket' | 'tracking' | 'order';

interface UnboxScanModeMeta {
  mode: UnboxScanMode;
  label: string;
  Icon: typeof MapPin;
  armedClass: string;
  iconClass: string;
}

export const UNBOX_SCAN_MODES: readonly UnboxScanModeMeta[] = [
  {
    mode: 'ticket',
    label: 'Ticket',
    Icon: TicketHelp,
    // Match carton-context / CHIP_TONES.ticket (orange) — not staff-rule emerald.
    armedClass: 'text-orange-600',
    iconClass: 'text-orange-500',
  },
  {
    mode: 'tracking',
    label: 'Tracking',
    Icon: MapPin,
    armedClass: 'text-blue-700',
    iconClass: 'text-blue-600',
  },
  {
    mode: 'order',
    // Dense scan-bar mark — full "Purchase order" lives on page/section faces
    // and mode HoverTooltip via UNBOX_SCAN_MODE_FULL_LABEL.
    label: 'PO #',
    Icon: Hash,
    armedClass: 'text-text-muted', // ds-allow-raw-neutral: identity/tone hue — PO-mode slate among orange/blue mode tints
    iconClass: 'text-text-soft',
  },
] as const;

/** Full operator name for tooltips — short `label` stays on the dense face. */
const UNBOX_SCAN_MODE_FULL_LABEL: Record<UnboxScanMode, string> = {
  ticket: 'Ticket #',
  tracking: 'Tracking #',
  order: 'Purchase order #',
};

function modeMeta(mode: UnboxScanMode): UnboxScanModeMeta {
  return UNBOX_SCAN_MODES.find((m) => m.mode === mode) ?? UNBOX_SCAN_MODES[1];
}

/**
 * Display-only hint when the operator hasn't armed a mode.
 * It does NOT decide resolution — an un-armed scan submits `'auto'` and the
 * server deep-scans ticket #, PO #, and tracking # before creating a carton.
 */
export function classifyUnboxScan(value: string): UnboxScanMode {
  if (looksLikeTicketScan(value)) return 'ticket';
  return value.includes('-') ? 'order' : 'tracking';
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** `'auto'` when un-armed (server deep-scans ticket/PO/tracking); else the armed mode. */
  onSubmit: (mode: UnboxScanMode | 'auto') => void;
  inputRef?: Ref<HTMLInputElement>;
  isResolving?: boolean;
  staffId?: string;
  armedMode?: UnboxScanMode | null;
  onToggleMode?: (mode: UnboxScanMode) => void;
  /**
   * Recent-rail facet popover, seated LEFT of the type dropdown. Mounted by the
   * panel only in Preview stance, where typing filters the rail instead of
   * arming a scan — so the filter icon appears exactly when the field filters.
   */
  filterSlot?: ReactNode;
  /**
   * Preview stance READ — resolves the value and opens the station read-only.
   * Owned by the panel (which holds the selection bus), not this bar.
   */
  previewLookup?: (
    value: string,
    mode: UnboxScanMode | null,
  ) => Promise<UnboxPreviewHit | null>;
}

export function ReceivingUnboxScanBar({
  value,
  onChange,
  onSubmit,
  inputRef,
  isResolving = false,
  staffId,
  armedMode = null,
  onToggleMode,
  filterSlot,
  previewLookup,
}: Props) {
  const fallbackRef = useRef<HTMLInputElement>(null);
  const stance = useScanStance();
  useScanTypeKeybinds({
    modes: UNBOX_SCAN_MODES.map((m) => m.mode),
    armedMode,
    onToggleMode,
    value,
    onChange,
  });

  const active = armedMode ? modeMeta(armedMode) : null;
  // The bar renders the value and the chrome — never a sentence, a status word
  // or a stance label. Preview leaves the placeholder EMPTY: naming the stance
  // in the field was the bar narrating itself.
  const placeholder =
    stance === 'preview'
      ? ''
      : armedMode
        ? `Scan ${active!.label}`
        : 'Ticket \u00b7 Tracking \u00b7 PO';

  const handleSubmit = (e?: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    // Armed mode is strict; un-armed submits 'auto' so the server deep-scans
    // ticket #, PO #, and tracking # (the icon is just a visual hint).
    onSubmit(armedMode ?? 'auto');
  };

  return (
    <ThemedStationScanBar
      value={value}
      onChange={onChange}
      onSubmit={handleSubmit}
      inputRef={inputRef ?? fallbackRef}
      staffId={staffId}
      placeholder={placeholder}
      autoFocus
      className="w-full"
      // Align the scan icon/text to the recent rail's dot/title column below.
      leadingColumn="rail"
      isResolving={isResolving}
      previewLookup={
        previewLookup ? (raw) => previewLookup(raw, armedMode) : undefined
      }
      previewMode={armedMode ?? 'auto'}
      rightContent={
        filterSlot || stance === 'scan' ? (
          <>
            {filterSlot}
            {/* The scan-TYPE picker belongs to scanning. In Preview the bar is
                the rail's find field, so a type to arm the NEXT SCAN with is a
                control for something this field is not about to do. */}
            {stance === 'scan' ? (
              <StationScanModeRail
                modes={UNBOX_SCAN_MODES}
                armedMode={armedMode}
                onToggleMode={onToggleMode}
                size="compact"
                getAriaLabel={(mode, armed) => {
                  const full = UNBOX_SCAN_MODE_FULL_LABEL[mode.mode];
                  return armed
                    ? `${full} armed for next scan. Click again to auto-detect.`
                    : `Arm ${full}: force the next scan to search ${full}.`;
                }}
                getTitle={(mode, armed) => {
                  const full = UNBOX_SCAN_MODE_FULL_LABEL[mode.mode];
                  return armed
                    ? `${full} armed \u2014 next scan. Click again to auto-detect.`
                    : `Search by ${full}`;
                }}
              />
            ) : null}
          </>
        ) : undefined
      }
    />
  );
}
