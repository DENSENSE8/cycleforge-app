'use client';

import { useRef, useState, type ComponentType } from 'react';
import { AlertTriangle, Boxes, Check, ScanBarcode, Tag, X } from '@/components/Icons';
import { Popover } from '@/design-system/primitives';
import { CHIP_TONES } from '@/components/ui/CopyChip';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { useReasonVocabulary } from '@/hooks/useReasonVocabulary';
import { NoSerialOfferCheck } from './NoSerialOfferCheck';
import {
  SERIAL_ABSENT_REASON_FLOW,
  mergeSerialAbsentReasons,
  serialAbsentReasonLabel,
  type SerialAbsentReasonMeta,
  type SerialAbsentSeverity,
} from '@/lib/receiving/serial-absent-reasons';

export interface SerialAbsentState {
  absent: boolean;
  reason: string | null;
}

interface Props {
  absent: boolean;
  reason: string | null;
  onChange: (next: SerialAbsentState) => void;
  /** When true the org enforces the checkpoint — the offer token reads as a required gate. */
  required?: boolean;
  disabled?: boolean;
  /** 'pill' = single-line offer token; 'check' = all-units offer token (multi-qty line level). */
  variant?: 'pill' | 'check';
  /**
   * Offer-check face only (`variant="check"`). Defaults to `flush` — the check
   * sits in the unit trailing action column / joined scan bar (square, no soft
   * island). Pass `default` only for a standalone soft control.
   */
  appearance?: 'default' | 'flush';
  /**
   * Committed state spans the full width of its slot as a dense chip face
   * (reason icon + underlined label), matching SKU/condition CopyChips. Use when
   * this *replaces an input field* (single-qty SerialCard).
   */
  fullWidth?: boolean;
  /** Drop the committed-state clear (✕) affordance — for when the PARENT owns the on/off toggle (e.g. */
  hideClear?: boolean;
}

type Glyph = ComponentType<{ className?: string }>;

/**
 * Each reason maps to a structural glyph; meaning is carried by the HoverTooltip
 * (house rule: contextual info via HoverTooltip, not inline text). Custom org
 * codes fall back to the generic serial glyph.
 */
const REASON_ICON: Record<string, Glyph> = {
  NOT_SERIALIZED: ScanBarcode,
  UNREADABLE: AlertTriangle,
  MISSING_LABEL: Tag,
  BULK: Boxes,
};
const reasonIcon = (code: string | null | undefined): Glyph =>
  (code && REASON_ICON[code]) || ScanBarcode;

/**
 * Menu-row + clear affordance tones keyed off reason *severity*. Committed chip
 * face uses {@link CHIP_TONES}.serial (routine) or amber icon (anomaly) —
 * dense CopyChip anatomy, not a pill.
 */
const TONE: Record<
  SerialAbsentSeverity,
  { icon: string; clear: string; rowSel: string; tick: string }
> = {
  routine: {
    icon: CHIP_TONES.serial.iconClass,
    clear: 'text-text-faint hover:bg-surface-strong hover:text-text-muted',
    rowSel: 'bg-surface-canvas text-text-default',
    tick: 'text-text-soft',
  },
  anomaly: {
    icon: 'text-amber-600',
    clear: 'text-amber-500 hover:bg-amber-100 hover:text-amber-700',
    rowSel: 'bg-amber-50 text-amber-800',
    tick: 'text-amber-600',
  },
};

const severityOf = (
  reasons: readonly SerialAbsentReasonMeta[],
  code: string | null,
): SerialAbsentSeverity =>
  reasons.find((r) => r.code === code)?.severity ?? 'routine';

const ChevronGlyph = ({ className = '' }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    className={`h-3 w-3 opacity-60 ${className}`}
  >
    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Explicit "no serial number" waiver for a receive line. */
export function NoSerialControl({
  absent,
  reason,
  onChange,
  required = false,
  disabled = false,
  variant = 'pill',
  appearance,
  fullWidth = false,
  hideClear = false,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  // Anchored to the whole token (not just the trigger button) so `matchWidth`
  // sizes the dropdown to the full component width.
  const anchorRef = useRef<HTMLDivElement>(null);
  const dbRows = useReasonVocabulary(SERIAL_ABSENT_REASON_FLOW);
  const reasons = mergeSerialAbsentReasons(dbRows);

  const activate = () => {
    if (disabled) return;
    const first = reasons[0]?.code ?? 'NOT_SERIALIZED';
    onChange({ absent: true, reason: reason ?? first });
    // Icon-only trigger → make the first pick explicit by opening the picker.
    setPickerOpen(true);
  };
  const clear = () => {
    onChange({ absent: false, reason: null });
    setPickerOpen(false);
  };
  const pick = (code: string) => {
    onChange({ absent: true, reason: code });
    setPickerOpen(false);
  };

  // ── Offer state: no waiver yet — an affordance that invites it.
  if (!absent) {
    const offerLabel =
      variant === 'check'
        ? 'No serial number for all units (same SKU, no serials available)'
        : 'Mark this item as having no serial number — cables, accessories, bulk parts';

    // The 'check' variant stands in the multi-qty unit list's TRAILING ACTION column, directly above the per-row add buttons — so it is the…
    if (variant === 'check') {
      return (
        <NoSerialOfferCheck
          onClick={activate}
          label={offerLabel}
          disabled={disabled}
          required={required}
          width="w-11"
          appearance={appearance ?? 'flush'}
        />
      );
    }

    return (
      <HoverTooltip label={required ? `Required — ${offerLabel}` : offerLabel} asChild>
        {/* ds-raw-button: bespoke dashed icon token, not a DS Button variant */}
        <button
          type="button"
          onClick={activate}
          disabled={disabled}
          aria-label={offerLabel}
          className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-dashed px-2.5 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            required
              ? 'border-amber-300 text-amber-600 hover:bg-amber-50 hover:text-amber-700'
              : 'border-border-default text-text-faint hover:border-border-default hover:bg-surface-hover hover:text-text-muted'
          }`}
        >
          <ScanBarcode className="h-4 w-4" />
          <ChevronGlyph />
        </button>
      </HoverTooltip>
    );
  }

  // ── Committed state: dense chip face (icon + underlined reason) + clear.
  const sev = severityOf(reasons, reason);
  const tone = TONE[sev];
  const Icon = reasonIcon(reason);
  const label = serialAbsentReasonLabel(reason);
  const hint = reasons.find((r) => r.code === reason)?.hint;

  return (
    <>
      <div
        ref={anchorRef}
        className={`${
          fullWidth ? 'flex w-full' : 'inline-flex max-w-full'
        } items-center px-1.5`}
      >
        <HoverTooltip
          label={hint ? `No serial · ${label} — ${hint}` : `No serial · ${label}`}
          asChild
          focusable={false}
        >
          {/* ds-raw-button: dense CopyChip-anatomy face — opens the reason popover */}
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            disabled={disabled}
            aria-haspopup="menu"
            aria-expanded={pickerOpen}
            aria-label={`No serial — ${label}. Change reason`}
            className={`${
              fullWidth ? 'flex min-w-0 flex-1' : 'inline-flex'
            } items-center justify-start gap-0.5 py-0 bg-transparent text-left transition-colors hover:opacity-80 disabled:opacity-50`}
          >
            <span className={`shrink-0 [&_svg]:h-3 [&_svg]:w-3 ${tone.icon}`}>
              <Icon />
            </span>
            <span
              className={`text-role-caption font-semibold font-mono text-text-default tracking-tight leading-none text-left truncate ${
                fullWidth ? 'min-w-0 flex-1' : ''
              }`}
            >
              {label}
            </span>
            <ChevronGlyph className={`shrink-0 ${fullWidth ? 'ml-auto' : ''}`} />
          </button>
        </HoverTooltip>
        {/* ds-raw-button: icon token clear affordance. Suppressed when the parent
            owns the on/off toggle (hideClear) so there's exactly one undo. */}
        {hideClear ? null : (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear no-serial waiver"
            className={`grid h-5 w-5 shrink-0 place-items-center rounded-md transition-colors ${tone.clear}`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <Popover
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        anchorRef={anchorRef}
        placement="bottom-start"
        matchWidth
        gap={0}
        role="menu"
        aria-label="No-serial reason"
        // Match the trigger width; min-w floors compact chips so labels stay
        // readable. fullWidth abuts the Serial field as a boxed extension.
        className={`min-w-[248px] p-1 ${fullWidth ? 'border-t-0' : ''}`}
      >
        {reasons.map((r) => {
          const selected = r.code === reason;
          const rowTone = TONE[r.severity];
          const RowIcon = reasonIcon(r.code);
          return (
            <HoverTooltip key={r.code} label={r.hint || r.label} asChild focusable={false}>
              {/* ds-raw-button: bespoke reason menu-item row */}
              <button
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => pick(r.code)}
                className={`flex w-full items-center gap-2.5 rounded-none px-2.5 py-2 text-left text-role-caption font-semibold transition-colors ${
                  selected ? rowTone.rowSel : 'text-text-muted hover:bg-surface-hover'
                }`}
              >
                <RowIcon className={`h-4 w-4 shrink-0 ${selected ? rowTone.icon : 'text-text-faint'}`} />
                <span className="flex-1 truncate">{r.label}</span>
                {selected ? <Check className={`h-4 w-4 shrink-0 ${rowTone.tick}`} /> : null}
              </button>
            </HoverTooltip>
          );
        })}
        {/* Undo — the item DOES have a serial after all. This is the primary way
            to clear the waiver when the parent hides the inline ✕ (fullWidth
            SerialCard), so it lives in the menu itself. */}
        <div className="my-1 border-t border-border-hairline" />
        <button
          type="button"
          role="menuitem"
          onClick={clear}
          className="flex w-full items-center gap-2.5 rounded-none px-2.5 py-2 text-left text-role-caption font-semibold text-rose-600 transition-colors hover:bg-rose-50"
        >
          <X className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">Undo — has a serial</span>
        </button>
      </Popover>
    </>
  );
}
