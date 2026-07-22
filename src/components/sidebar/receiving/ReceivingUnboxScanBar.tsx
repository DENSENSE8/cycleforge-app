'use client';

import { useRef, type FormEvent, type Ref } from 'react';
import { MapPin, Hash, TicketHelp, Barcode } from '@/components/Icons';
import {
  StationScanLeadingIcon,
  StationScanModeRail,
  ThemedStationScanBar,
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
    label: 'Ticket #',
    Icon: TicketHelp,
    // Match carton-context / CHIP_TONES.ticket (orange) — not staff-rule emerald.
    armedClass: 'text-orange-600',
    iconClass: 'text-orange-500',
  },
  {
    mode: 'tracking',
    label: 'Tracking #',
    Icon: MapPin,
    armedClass: 'text-blue-700',
    iconClass: 'text-blue-600',
  },
  {
    mode: 'order',
    label: 'PO #',
    Icon: Hash,
    armedClass: 'text-text-muted', // ds-allow-raw-neutral: identity/tone hue — PO-mode slate among orange/blue mode tints
    iconClass: 'text-text-soft',
  },
] as const;

function modeMeta(mode: UnboxScanMode): UnboxScanModeMeta {
  return UNBOX_SCAN_MODES.find((m) => m.mode === mode) ?? UNBOX_SCAN_MODES[1];
}

/**
 * Display-only hint for the leading icon when the operator hasn't armed a mode.
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

  const effective: UnboxScanMode = armedMode ?? classifyUnboxScan(value);
  const active = modeMeta(effective);
  // Un-armed: neutral barcode — mode lives in the right rail + short placeholder.
  const LeadingIcon = armedMode ? active.Icon : Barcode;
  const leadingTint = armedMode ? active.iconClass : 'text-text-faint';

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
      placeholder={armedMode ? `Scan ${active.label}` : 'Ticket · Tracking · PO'}
      autoFocus
      className="w-full"
      // Align the scan icon/text to the recent rail's dot/title column below.
      leadingColumn="rail"
      rightPadClass="pr-32"
      isResolving={isResolving}
      icon={
        <StationScanLeadingIcon
          Icon={LeadingIcon}
          tintClassName={leadingTint}
          ariaLabel={
            armedMode
              ? `Armed: ${active.label}`
              : 'Auto — looks up Ticket #, PO #, and Tracking #'
          }
          title={
            armedMode
              ? `Next scan forced to ${active.label}. Click the icon again to auto-detect.`
              : 'Auto — looks the scan up as a Ticket #, PO #, and Tracking # before creating a carton'
          }
        />
      }
      rightContent={
        <StationScanModeRail
          modes={UNBOX_SCAN_MODES}
          armedMode={armedMode}
          onToggleMode={onToggleMode}
          size="compact"
          getAriaLabel={(mode, armed) =>
            armed
              ? `${mode.label} armed for next scan. Click again to auto-detect.`
              : `Arm ${mode.label}: force the next scan to search ${mode.label}.`
          }
          getTitle={(mode, armed) =>
            armed
              ? `${mode.label} armed — next scan. Click again to auto-detect.`
              : `Search by ${mode.label}`
          }
        />
      }
    />
  );
}
