'use client';

import { useRef, type FormEvent, type Ref } from 'react';
import { MapPin, Hash, TicketHelp } from '@/components/Icons';
import {
  StationScanModeRail,
  ThemedStationScanBar,
  classifyPreviewFromArmed,
  useScanStance,
  useScanTypeKeybinds,
} from '@/components/station/scan-bar';
// From the light scan-parser module — importing via lib/support/tickets drags
// the server-only tenancy/db (Neon driver) into this client bundle.
import { looksLikeTicketScan } from '@/lib/support/ticket-scan';

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
  const typeLabel = active?.label ?? 'Auto';
  const placeholder =
    stance === 'preview'
      ? `Preview: would search ${typeLabel}`
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
      classifyPreview={(raw) =>
        classifyPreviewFromArmed({
          value: raw,
          armedMode,
          autoMode: classifyUnboxScan(raw),
          labels: { ticket: 'Ticket', tracking: 'Tracking', order: 'PO' },
        })
      }
      rightContent={
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
      }
    />
  );
}
