"use client";

import {
  useEffect,
  useRef,
  useState,
  cloneElement,
  isValidElement,
  type MutableRefObject,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { X, Trash2, ScanBarcode } from "@/components/Icons";
import { TextField, IconButton } from "@/design-system/primitives";
import { cornerClass } from "@/design-system/tokens/radius";
import { HoverTooltip } from "@/components/ui/HoverTooltip";
import { cn } from "@/utils/_cn";
import { ConditionBadge } from "./ConditionBadge";
import { NoSerialOfferCheck } from "./line-edit/NoSerialOfferCheck";
import {
  NoSerialControl,
  type SerialAbsentState,
} from "./line-edit/NoSerialControl";
import { unitRowVisibleWindow } from "./line-receive-mode";
import { bindSerialsToUnitSlots } from "@/lib/receiving/optimistic-serials";

export interface UnitLike {
  id: number;
  serial_number: string;
  condition_grade?: string | null;
  current_status?: string;
}

/** Controlled condition expand for flush Units rows (collapses photo + serial). */
interface ConditionExpandPairing {
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
}

/** Materialised `receiving_line_unit` row as the slot list needs it. */
export interface UnitSlotView {
  id: number;
  ordinal: number;
  serial_unit_id: number | null;
  serial: string | null;
  serial_absent: boolean;
  serial_absent_reason: string | null;
  condition_grade: string | null;
}

interface Props {
  /** How many unit rows to render (= expected qty, min saved/1). Ignored when `units` is set. */
  total: number;
  /** Saved serials in scan order. Used for lookup when `units` is present; dense slots otherwise. */
  saved: ReadonlyArray<UnitLike>;
  /**
   * Materialised per-unit rows (ordinal order). When present, each row is keyed
   * by unit identity — empty slots get a green-check offer, waived slots render
   * the committed reason bar. Absent = legacy dense `saved[i]` behaviour.
   */
  units?: ReadonlyArray<UnitSlotView> | null;
  /** Currently selected (expanded) unit index. */
  selectedIndex: number;
  onSelect: (index: number) => void;
  disabled?: boolean;
  isSubmitting?: boolean;
  /** Org enforces the serial checkpoint — the per-row check reads as required. */
  requireSerialConfirmation?: boolean;
  /** Fire when the operator taps the per-row green check (empty slot with a unit id). */
  onMarkUnitNoSerial?: (unitId: number) => void;
  /** Fire when the operator changes / clears a committed per-unit waiver. */
  onUnitSerialAbsentChange?: (unitId: number, next: SerialAbsentState) => void;
  /**
   * Rendered inside the expanded row's condition cell (e.g. ConditionPills).
   * Flush Units rows pass a controlled expand pairing so expanding the grade
   * strip collapses photo + serial in the same joined bar (SerialCard pairing).
   */
  renderExpandedMeta?: (
    serial: UnitLike | null,
    index: number,
    pairing?: { expanded: boolean; onExpandedChange: (next: boolean) => void },
  ) => ReactNode;
  /**
   * When true, the selected row's expanded meta (condition/verdict pills) is
   * shown immediately instead of collapsing to a text badge until hover / serial
   * focus. Use where picking the grade is the point of the row (Unbox), not an
   * afterthought to scanning.
   */
  alwaysShowExpandedMeta?: boolean;
  /**
   * Render the expanded (active) row to match the single-qty SerialCard layout:
   * drop the `n/N` counter and show the condition meta inline (no pending badge,
   * no hover-collapse). Used by the multi-qty same-SKU receiving display so the
   * active unit reads identically to a single-qty line.
   */
  singleRowExpanded?: boolean;
  /** Compact node on the right of a collapsed row (e.g. condition badge / verdict glyph). */
  renderCollapsedMeta?: (serial: UnitLike | null, index: number) => ReactNode;
  /** Station body shows completion only; editing is handed to the Units display. */
  stationCompact?: boolean;
  /**
   * Units Displays flush chrome: hairline full-bleed rows, square IconButtons,
   * TextField `appearance="flush"`. Station compact paths leave this false.
   */
  flush?: boolean;
  /**
   * Item-camera control on every flush unit row (line-scoped photos).
   * Sits after the condition tag when `flush` is set.
   */
  activeRowLeading?: ReactNode;
  onAddSerial: (index: number, serial: string) => void | Promise<void>;
  onDeleteSerial: (serial: UnitLike) => void;
  onReplaceSerial: (original: UnitLike, next: string) => void;
  /**
   * Filled unit → pencil. Opens Units display / edit handoff. When omitted,
   * pencil falls back to in-row replace (scan field).
   */
  onEditFilledSerial?: (serial: UnitLike) => void;
  /** Edit from PO header {@link SerialChipWithMenu} → expanded unit scan input. */
  serialEditTarget?: UnitLike | null;
  /** Mirrors the first empty slot (or row 0) for dock → scan handoff. */
  primaryInputRef?: RefObject<HTMLInputElement | null>;
  /**
   * Hard cap on how many unit rows mount in the DOM. When total exceeds this,
   * only a window that keeps `selectedIndex` visible is rendered. Pair with
   * {@link overflowSlot} for the "+N more" CTA / manage overlay.
   */
  maxVisible?: number;
  /** Rendered after the visible window when rows are capped (overflow CTA). */
  overflowSlot?: ReactNode;
}

function last8(sn: string): string {
  const v = (sn || "").trim();
  return v.length > 8 ? v.slice(-8) : v;
}

function synthesizeLinkedSerial(unit: UnitSlotView): UnitLike | null {
  if (unit.serial_unit_id == null || !unit.serial) return null;
  return {
    id: unit.serial_unit_id,
    serial_number: unit.serial,
    condition_grade: unit.condition_grade,
  };
}

/**
 * Selectable per-unit list for multi-quantity lines. One unit is expanded
 * (the selected one) and shows its serial entry + an optional meta slot
 * (condition pills for receiving). Every other unit collapses to a single
 * clickable line — `n/N` + condition + serial (see collapsed rows).
 * Expanded body is condition pills + scan input only (no duplicate title row).
 * Selecting a unit is what drives the workspace's print preview + print target.
 */
export function UnitSlotList({
  total,
  saved,
  units = null,
  selectedIndex,
  onSelect,
  disabled = false,
  isSubmitting = false,
  requireSerialConfirmation = false,
  onMarkUnitNoSerial,
  onUnitSerialAbsentChange,
  renderExpandedMeta,
  alwaysShowExpandedMeta = false,
  singleRowExpanded = false,
  renderCollapsedMeta,
  stationCompact = false,
  flush = false,
  activeRowLeading,
  onAddSerial,
  onDeleteSerial,
  onReplaceSerial,
  onEditFilledSerial,
  serialEditTarget = null,
  primaryInputRef,
  maxVisible,
  overflowSlot,
}: Props) {
  const useUnits = Array.isArray(units) && units.length > 0;
  // Flush Units explosion: one row per live serial (line-level adder owns
  // empty entry). Multi-qty Station body still pads to materialised units.
  const liveSaved = saved.filter((s) => {
    const flag = (s as UnitLike & { _optimistic?: string })._optimistic;
    return flag !== "removing";
  });
  const count = flush
    ? liveSaved.length
    : useUnits
      ? Math.max(units!.length, saved.length, total)
      : Math.max(total, saved.length, 1);
  const boundToUnits = useUnits ? bindSerialsToUnitSlots(units!, saved) : null;
  const boundIds = new Set(
    (boundToUnits ?? [])
      .filter((s): s is UnitLike => s != null)
      .map((s) => s.id),
  );
  const overflowSerials = useUnits
    ? saved.filter((s) => {
        if (boundIds.has(s.id)) return false;
        const flag = (s as UnitLike & { _optimistic?: string })._optimistic;
        return flag !== "removing";
      })
    : [];
  const allRows = flush
    ? liveSaved.map((serial, index) => {
        const unit = useUnits
          ? (units!.find((u) => u.serial_unit_id === serial.id) ?? null)
          : null;
        return { index, unit, serial };
      })
    : useUnits
      ? Array.from({ length: count }, (_, index) => {
          if (index < units!.length) {
            const unit = units![index];
            // Prefer bound saved serials; never synthesize a serial that was
            // just removed from `saved` (stale unit.serial_unit_id).
            const bound = boundToUnits![index] ?? null;
            const synthesized = synthesizeLinkedSerial(unit);
            const serial =
              bound ??
              (synthesized &&
              saved.some((s) => s.id === synthesized.id)
                ? synthesized
                : null);
            return { index, unit, serial };
          }
          return {
            index,
            unit: null as UnitSlotView | null,
            serial: overflowSerials[index - units!.length] ?? null,
          };
        })
      : Array.from({ length: count }, (_, i) => ({
          index: i,
          unit: null as UnitSlotView | null,
          serial: saved[i] ?? null,
        }));

  // Cap DOM rows: keep a window that includes the selected unit so scan-advance
  // never mounts hundreds of ExpandedRow nodes for bulk commodities.
  const cap =
    maxVisible != null && maxVisible > 0 ? maxVisible : allRows.length;
  const { start: windowStart, end: windowEnd } = unitRowVisibleWindow(
    allRows.length,
    selectedIndex,
    cap,
  );
  const rows = allRows.slice(windowStart, windowEnd);
  const isCapped =
    maxVisible != null && maxVisible > 0 && allRows.length > maxVisible;

  // All-expanded (single-row) mode: every unit shows its own open serial input.
  // A committed scan hands focus straight to the next row's input *immediately*
  // (the write is queued and processed in the background by useLineSerials), so
  // a multi-unit lot is scanned top-to-bottom in one fast pass without waiting
  // on the network. Inputs stay enabled during submit (see ExpandedRow) so the
  // newly-focused field actually accepts the next scan.
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const focusRow = (index: number) => {
    const el = inputRefs.current[index];
    if (el && !el.disabled) {
      el.focus();
      return;
    }
    // Next row may be outside the visible window — select it so the window slides.
    if (index >= 0 && index < count) onSelect(index);
  };
  // First not-yet-scanned / not-waived slot — autofocused on mount in all-expanded mode.
  const firstEmptyIndex = allRows.findIndex(
    ({ serial, unit }) => !serial && !unit?.serial_absent,
  );
  const primaryIndex = firstEmptyIndex >= 0 ? firstEmptyIndex : 0;

  const syncPrimaryInputRef = (index: number, el: HTMLInputElement | null) => {
    inputRefs.current[index] = el;
    if (primaryInputRef && singleRowExpanded && index === primaryIndex) {
      (primaryInputRef as MutableRefObject<HTMLInputElement | null>).current =
        el;
    }
  };

  useEffect(() => {
    if (!primaryInputRef || !singleRowExpanded) return;
    (primaryInputRef as MutableRefObject<HTMLInputElement | null>).current =
      inputRefs.current[primaryIndex] ?? null;
  }, [primaryIndex, primaryInputRef, saved.length, singleRowExpanded, units]);

  return (
    <div className="flex min-w-0 flex-col">
      <div
        className={
          flush
            ? 'flex min-w-0 flex-col divide-y divide-border-hairline'
            : 'flex min-w-0 flex-col divide-y divide-border-soft'
        }
        data-unit-slot-list
        data-unit-slot-count={rows.length}
        data-unit-slot-total={count}
        data-unit-slot-flush={flush ? 'true' : undefined}
      >
        {rows.map(({ index, serial, unit }) => {
          const expanded = singleRowExpanded || index === selectedIndex;
          return expanded ? (
            <ExpandedRow
              key={`row-${unit?.id ?? serial?.id ?? `empty-${index}`}`}
              index={index}
              total={count}
              serial={serial}
              unit={unit}
              disabled={disabled}
              isSubmitting={isSubmitting}
              requireSerialConfirmation={requireSerialConfirmation}
              onMarkUnitNoSerial={onMarkUnitNoSerial}
              onUnitSerialAbsentChange={onUnitSerialAbsentChange}
              renderMeta={renderExpandedMeta}
              alwaysShowMeta={alwaysShowExpandedMeta || singleRowExpanded}
              singleRow={singleRowExpanded}
              stationCompact={stationCompact}
              flush={flush}
              leading={
                flush && activeRowLeading
                  ? isValidElement(activeRowLeading)
                    ? cloneElement(activeRowLeading, {
                        key: `row-leading-${unit?.id ?? serial?.id ?? index}`,
                      })
                    : activeRowLeading
                  : null
              }
              serialEditTarget={
                serialEditTarget?.id != null &&
                serial?.id === serialEditTarget.id
                  ? serialEditTarget
                  : null
              }
              inputRef={
                singleRowExpanded
                  ? (el) => {
                      syncPrimaryInputRef(index, el);
                    }
                  : undefined
              }
              autoFocusInput={
                singleRowExpanded &&
                index === firstEmptyIndex &&
                index >= windowStart &&
                index < windowEnd
              }
              onFocusRow={singleRowExpanded ? () => onSelect(index) : undefined}
              onAdvance={
                singleRowExpanded ? () => focusRow(index + 1) : undefined
              }
              onAddSerial={(sn) => onAddSerial(index, sn)}
              onDeleteSerial={onDeleteSerial}
              onReplaceSerial={onReplaceSerial}
              onEditFilledSerial={onEditFilledSerial}
            />
          ) : (
            <CollapsedRow
              key={unit?.id ?? serial?.id ?? `empty-${index}`}
              index={index}
              total={count}
              serial={serial}
              waived={!!unit?.serial_absent}
              waivedReason={unit?.serial_absent_reason ?? null}
              meta={renderCollapsedMeta?.(serial, index)}
              flush={flush}
              onSelect={() => onSelect(index)}
            />
          );
        })}
      </div>
      {isCapped && overflowSlot ? (
        <div
          className={
            flush
              ? 'border-t border-border-hairline px-3 pt-2'
              : 'border-t border-border-soft px-1 pt-2'
          }
        >
          {overflowSlot}
        </div>
      ) : null}
    </div>
  );
}

function UnitRowTitle({
  index,
  total,
  meta,
  trailing,
}: {
  index: number;
  total: number;
  meta: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <span className="shrink-0 font-mono text-role-micro tabular-nums text-text-soft">
        {index + 1}/{total}
      </span>
      {meta ? <span className="inline-flex items-center">{meta}</span> : null}
      {trailing ? <span className="ml-auto shrink-0">{trailing}</span> : null}
    </div>
  );
}

function CollapsedRow({
  index,
  total,
  serial,
  waived,
  waivedReason,
  meta,
  flush = false,
  onSelect,
}: {
  index: number;
  total: number;
  serial: UnitLike | null;
  waived: boolean;
  waivedReason: string | null;
  meta: ReactNode;
  flush?: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={
        flush
          ? "w-full cursor-pointer px-0 py-0 text-left transition-colors hover:bg-surface-hover"
          : "w-full cursor-pointer px-1 py-2.5 text-left transition-colors hover:bg-surface-hover"
      }
    >
      <UnitRowTitle
        index={index}
        total={total}
        meta={meta}
        trailing={
          serial ? (
            <span className="font-mono text-sm font-semibold tracking-tight text-text-default underline decoration-emerald-500 decoration-2 underline-offset-2">
              {last8(serial.serial_number)}
            </span>
          ) : waived ? (
            <span className="text-role-caption font-semibold uppercase tracking-widest text-emerald-700">
              No serial
              {waivedReason
                ? ` · ${waivedReason.replace(/_/g, " ").toLowerCase()}`
                : ""}
            </span>
          ) : (
            <span className="text-role-caption font-semibold uppercase tracking-widest text-text-faint">
              Empty · tap to scan
            </span>
          )
        }
      />
    </div>
  );
}

function ExpandedRow({
  index,
  total,
  serial,
  unit,
  disabled,
  isSubmitting,
  requireSerialConfirmation,
  onMarkUnitNoSerial,
  onUnitSerialAbsentChange,
  renderMeta,
  alwaysShowMeta = false,
  singleRow = false,
  stationCompact = false,
  flush = false,
  leading = null,
  serialEditTarget,
  inputRef,
  autoFocusInput = false,
  onFocusRow,
  onAdvance,
  onAddSerial,
  onDeleteSerial,
  onReplaceSerial,
  onEditFilledSerial,
}: {
  index: number;
  total: number;
  serial: UnitLike | null;
  unit: UnitSlotView | null;
  disabled: boolean;
  isSubmitting: boolean;
  requireSerialConfirmation: boolean;
  onMarkUnitNoSerial?: (unitId: number) => void;
  onUnitSerialAbsentChange?: (unitId: number, next: SerialAbsentState) => void;
  renderMeta?: (
    serial: UnitLike | null,
    index: number,
    pairing?: ConditionExpandPairing,
  ) => ReactNode;
  alwaysShowMeta?: boolean;
  /** Hide the `n/N` counter so the row mirrors the single-qty SerialCard. */
  singleRow?: boolean;
  /** Collapse completed serials to a scan-status icon in the Station body. */
  stationCompact?: boolean;
  /** Units Displays flush chrome. */
  flush?: boolean;
  /** Optional item-camera cell — after condition on every flush row. */
  leading?: ReactNode;
  serialEditTarget: UnitLike | null;
  /** Forwarded to the serial input so the parent can advance focus between rows. */
  inputRef?: Ref<HTMLInputElement>;
  /** Autofocus this row's serial input on mount (the first empty slot). */
  autoFocusInput?: boolean;
  /** Fired when the input gains focus — lets the parent mark this unit active. */
  onFocusRow?: () => void;
  /** Fired right after a serial is committed — parent jumps focus to the next row. */
  onAdvance?: () => void;
  onAddSerial: (serial: string) => void | Promise<void>;
  onDeleteSerial: (serial: UnitLike) => void;
  onReplaceSerial: (original: UnitLike, next: string) => void;
  /** Filled unit → click readout (Units display / in-row replace). */
  onEditFilledSerial?: (serial: UnitLike) => void;
}) {
  const [scan, setScan] = useState("");
  const [editing, setEditing] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  // When the row's whole purpose is grading (Unbox), keep the pills visible
  // instead of hiding them behind hover/serial-focus.
  const showMeta =
    alwaysShowMeta || isFocused || isSubmitting || scan.length > 0;
  const waived = !!unit?.serial_absent;
  const unitId = unit?.id ?? null;
  const canOfferNoSerial =
    !waived &&
    !serial &&
    !editing &&
    !scan.trim() &&
    unitId != null &&
    typeof onMarkUnitNoSerial === "function";
  // Committed serial — show readout + delete (not an empty field with + / check).
  const showFilledReadout = !!serial && !editing && !waived;
  // Joined industrial bar: Unbox accordion single-row OR Units Displays flush.
  const joined = singleRow || flush;

  const slotGrade = String(
    serial?.condition_grade ?? unit?.condition_grade ?? "",
  ).trim();
  const hasGrade = Boolean(slotGrade);
  // Flush Units: expand grade strip when ungraded (SerialCard pairing). Graded
  // rows start collapsed so photo + serial keep the bar.
  const [condExpanded, setCondExpanded] = useState(() => flush && !hasGrade);

  useEffect(() => {
    if (!hasGrade) setCondExpanded(true);
  }, [hasGrade]);

  useEffect(() => {
    if (!serialEditTarget || serial?.id !== serialEditTarget.id) return;
    setEditing(true);
    setScan(serialEditTarget.serial_number);
    // Collapse condition so serial edit owns the bar (SerialCard pairing).
    if (flush) setCondExpanded(false);
  }, [serial?.id, serialEditTarget, flush]);

  useEffect(() => {
    if (editing && flush) setCondExpanded(false);
  }, [editing, flush]);

  const flushConditionExpanded = Boolean(
    flush && renderMeta && (condExpanded || !hasGrade),
  );
  const pairing: ConditionExpandPairing | undefined = flush
    ? {
        expanded: condExpanded || !hasGrade,
        onExpandedChange: setCondExpanded,
      }
    : undefined;
  const meta = renderMeta?.(serial, index, pairing) ?? null;

  const beginLocalEdit = () => {
    if (!serial) return;
    setEditing(true);
    setScan(serial.serial_number);
    onFocusRow?.();
  };

  const handleEditFilled = () => {
    if (!serial) return;
    if (onEditFilledSerial) {
      onEditFilledSerial(serial);
      return;
    }
    beginLocalEdit();
  };

  const submit = () => {
    const v = scan.trim();
    if (!v || disabled) return;
    if (editing && serial) {
      if (v !== serial.serial_number) onReplaceSerial(serial, v);
      setEditing(false);
      setScan("");
      return;
    }
    // Fire-and-forget: the parent queues the write, so clear + advance focus to
    // the next row immediately instead of waiting on the network round-trip.
    void onAddSerial(v);
    setScan("");
    onAdvance?.();
  };

  return (
    <div
      className={cn(
        "min-w-0 group",
        flush ? "px-0 py-0" : joined ? "py-0" : "px-1 py-2.5",
      )}
      data-unit-slot-cond-expanded={flushConditionExpanded ? "true" : undefined}
    >
      <div
        className={cn(
          "flex min-w-0 w-full items-stretch",
          joined
            ? cn(
                "h-11 w-full overflow-hidden bg-surface-card divide-x divide-border-soft",
                cornerClass("flush"),
                // Flush + station compact: borderless — parent divide-y / accordion
                // seams own horizontal rules; divide-x owns cell joins.
                flush || stationCompact
                  ? "border-0"
                  : "border border-border-default",
              )
            : "items-center gap-2",
        )}
      >
        {/* Active unit's n/N — same column as the collapsed rows so the qty +
            condition read down one vertical line instead of jumping left.
            Hidden in joined mode so the active unit mirrors a single-qty line. */}
        {joined ? null : (
          <span className="shrink-0 font-mono text-role-micro tabular-nums text-text-soft">
            {index + 1}/{total}
          </span>
        )}
        {meta ? (
          joined ? (
            // PO accordion / Units flush: joined bar. Collapsed Tags face is
            // min-w-11; expanded ConditionPills must grow past that lock —
            // a fixed w-11 clipped the grade row so clicks never opened it.
            // Flush expand pairing: pills own the full bar (photo + serial hide).
            // Condition sits leftmost; item camera follows when collapsed.
            <div
              className={cn(
                "flex h-11 items-stretch [&>*]:h-full",
                flushConditionExpanded
                  ? "min-w-0 flex-1"
                  : "min-w-11 shrink-0",
              )}
            >
              {meta}
            </div>
          ) : (
            <div
              className={`flex min-w-0 items-center gap-2 transition-all duration-700 ease-in-out overflow-hidden ${
                showMeta
                  ? "min-w-0 max-w-full flex-1 opacity-100 mr-1"
                  : "max-w-[3rem] opacity-100 group-hover:max-w-full group-hover:flex-1 group-hover:mr-1"
              }`}
            >
              <div
                className={`${showMeta ? "hidden" : "block group-hover:hidden"}`}
              >
                <ConditionBadge
                  grade={serial?.condition_grade ?? unit?.condition_grade}
                />
              </div>
              <div
                className={`${showMeta ? "block" : "hidden group-hover:block"}`}
              >
                <div className="inline-flex items-center">{meta}</div>
              </div>
              <div
                className={`h-8 w-px bg-surface-sunken shrink-0 ${showMeta ? "block" : "hidden group-hover:block"}`}
              />
            </div>
          )
        ) : null}
        {leading && !flushConditionExpanded ? (
          <div className="flex size-11 shrink-0 items-stretch [&>*]:size-full [&>*]:min-w-0">
            {leading}
          </div>
        ) : null}

        {flushConditionExpanded ? null : stationCompact && showFilledReadout ? (
          <div className="min-w-0 flex-1" />
        ) : (
          <div className="flex min-w-0 flex-1 items-stretch">
            {waived && unitId != null && onUnitSerialAbsentChange ? (
              // Committed per-unit waiver — replaces the input, matching single-qty
              // SerialCard's noSerialSlot (full-width reason bar).
              <NoSerialControl
                absent
                fullWidth
                hideClear
                reason={unit?.serial_absent_reason ?? null}
                required={requireSerialConfirmation}
                disabled={disabled}
                onChange={(next) => onUnitSerialAbsentChange(unitId, next)}
              />
            ) : showFilledReadout ? (
              // ds-raw-button: serial readout handoff — click to edit; trailing Trash2 deletes
              <button
                type="button"
                disabled={disabled}
                onClick={handleEditFilled}
                data-unit-serial-readout
                className={cn(
                  "flex h-11 w-full min-w-0 items-center truncate px-3 text-left font-mono text-role-caption text-text-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-strong/20 disabled:cursor-not-allowed disabled:opacity-60",
                  joined
                    ? cn(cornerClass("flush"), "bg-surface-canvas")
                    : "rounded-xl border border-border-soft bg-surface-canvas hover:border-border-strong",
                )}
                // ds-allow-focus — readout is the edit handoff; IconButton sibling owns delete.
              >
                {serial.serial_number}
              </button>
            ) : (
              <TextField
                ref={inputRef}
                label="Serial"
                data-unbox-serial-input
                appearance={joined ? "flush" : "default"}
                value={scan}
                onChange={setScan}
                tone="neutral"
                mono
                // Never disable for in-flight writes — a disabled input blurs
                // and drops the barcode wedge mid-lot.
                disabled={disabled}
                autoComplete="off"
                spellCheck={false}
                // eslint-disable-next-line jsx-a11y/no-autofocus -- scan-focused workflow
                autoFocus={autoFocusInput}
                onFocus={() => {
                  setIsFocused(true);
                  onFocusRow?.();
                }}
                onBlur={() => setIsFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  } else if (e.key === "Escape" && editing) {
                    e.preventDefault();
                    setEditing(false);
                    setScan("");
                  }
                }}
                trailing={
                  scan ? (
                    <IconButton
                      onClick={() => {
                        setScan("");
                        setEditing(false);
                      }}
                      ariaLabel={editing ? "Cancel edit" : "Clear"}
                      icon={<X className="h-3.5 w-3.5" />}
                      className="rounded-md p-1 text-text-faint hover:bg-surface-sunken hover:text-text-muted"
                    />
                  ) : undefined
                }
              />
            )}
          </div>
        )}

        {flushConditionExpanded ? null : waived ? null : showFilledReadout &&
          stationCompact ? (
          <div className="flex h-11 w-11 shrink-0 self-stretch">
            <HoverTooltip label="Scanned · edit in Units display" asChild>
              <IconButton
                onClick={handleEditFilled}
                disabled={disabled}
                ariaLabel="Serial scanned. Open Units display to edit"
                data-unit-scanned-icon
                icon={<ScanBarcode className="h-4 w-4" />}
                className={cn(
                  "flex h-full w-full items-center justify-center bg-emerald-50 p-0 text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60",
                  cornerClass("flush"),
                )}
                // ds-allow-control-size — joined trailing cell fills h-11×w-11
              />
            </HoverTooltip>
          </div>
        ) : showFilledReadout ? (
          <div className={cn(joined && "flex h-11 w-11 shrink-0 self-stretch")}>
            <HoverTooltip label="Remove serial" asChild>
              <IconButton
                onClick={() => {
                  if (!serial) return;
                  onDeleteSerial(serial);
                }}
                disabled={disabled}
                ariaLabel="Remove serial"
                data-unit-delete-serial
                size={joined ? undefined : "touch"}
                icon={<Trash2 className="h-4 w-4" />}
                className={cn(
                  "text-text-muted hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-60",
                  joined
                    ? cn(
                        cornerClass("flush"),
                        "flex h-full w-full items-center justify-center bg-surface-card p-0",
                      )
                    : "border border-border-soft bg-surface-card shadow-sm",
                )}
                // ds-allow-control-size — joined trailing cell fills h-11×w-11
              />
            </HoverTooltip>
          </div>
        ) : canOfferNoSerial ? (
          // Replaces the greyed-out empty-field `+` entirely — one green check,
          // shared with the single-qty SerialCard (NoSerialOfferCheck).
          <NoSerialOfferCheck
            onClick={() => onMarkUnitNoSerial?.(unitId!)}
            label="Mark this unit as having no serial number"
            disabled={disabled}
            required={requireSerialConfirmation}
            width="w-11"
            appearance={joined ? "flush" : "default"}
          />
        ) : (
          <div className={cn(joined && "flex h-11 w-11 shrink-0 self-stretch")}>
            <HoverTooltip label={editing ? "Save serial" : "Add serial"} asChild>
              <IconButton
                onClick={submit}
                disabled={
                  !scan.trim() || disabled
                }
                ariaLabel={editing ? "Save serial" : "Add serial"}
                size={joined ? undefined : "touch"}
                icon={
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    className="h-5 w-5"
                  >
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                }
                className={cn(
                  "text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-surface-strong disabled:text-text-faint",
                  joined
                    ? cn(
                        cornerClass("flush"),
                        "flex h-full w-full items-center justify-center bg-emerald-600 p-0",
                      )
                    : "bg-emerald-600 shadow-sm",
                )}
                // ds-allow-control-size — joined trailing cell fills h-11×w-11
              />
            </HoverTooltip>
          </div>
        )}
      </div>
    </div>
  );
}
