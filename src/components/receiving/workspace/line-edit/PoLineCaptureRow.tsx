'use client';

/**
 * Unbox PO-line capture face — condition + Serial / Photos on one row.
 *
 * Always collapsed Tags + open serial (optimistic mobile-app grammar):
 *   [ Tags (USED_A) | SerialScanField (focused) | Photos ]
 * Hover Tags → expand pills in the SAME row — Serial + Photos stay as compact
 * icon buttons on the right (not the wide serial field); grade click selects
 * (never clears), collapses, re-opens + focuses serial. Click Tags / the row
 * (outside Photos) focuses serial. ↑/↓ in the serial field steps PO lines.
 *
 * Same face for found, lined unfound, and empty stub.
 */

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Camera, ScanBarcode } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import {
  CAPTURE_SEGMENT_ORDER,
  PO_LINE_CAPTURE_CONDITION_CLASS,
  PO_LINE_CAPTURE_COUNT_CLASS,
  PO_LINE_CAPTURE_GLYPH_CLASS,
  PO_LINE_CAPTURE_ROW_CLASS,
  captureSegmentClass,
  type CaptureSegmentKey,
} from '../po-line-capture-chrome';
import { ConditionPills } from '../ConditionPills';
import {
  SerialScanField,
  type SavedSerial,
} from '../SerialScanField';
import { ItemPhotoCaptureStrip } from './ItemPhotoCaptureStrip';
import {
  focusUnboxCaptureSerial,
  scheduleFocusUnboxCaptureSerialInLine,
} from './focus-unbox-capture-serial';

/** Default grade on a fresh scan — operators override via hover → pick. */
const CAPTURE_DEFAULT_GRADE = 'USED_A';

export function PoLineCaptureRow({
  condition,
  onConditionChange,
  serialDone = false,
  latestSerial = null,
  noSerialActive = false,
  photoCount = 0,
  showPhotos = true,
  receivingId = null,
  lineId = null,
  staffId = 0,
  poRef = null,
  poRouteRef = null,
  activeStep = null,
  disabled = false,
  saved = [],
  onAddSerial,
  onReplaceSerial,
  onMarkNoSerial,
  noSerialSlot,
  lookupBusy = false,
  editingSerial = null,
  onEditingSerialChange,
  autoFocusSerial = false,
  focusKey = null,
  onSerialPanelOpen,
  autoCommitDefaultGrade = false,
  onArmCapture,
}: {
  condition: string | null | undefined;
  onConditionChange: (grade: string) => void;
  /** Serial captured or waived — segment readout only. */
  serialDone?: boolean;
  latestSerial?: string | null;
  noSerialActive?: boolean;
  photoCount?: number;
  /**
   * Photos segment + in-row strip when line-scoped capture is possible.
   * Default true; stubs without receiving/line ids hide Photos.
   */
  showPhotos?: boolean;
  receivingId?: number | null;
  lineId?: number | null;
  staffId?: number;
  poRef?: string | null;
  poRouteRef?: string | null;
  /**
   * The dock's `activeKey` (`useUnboxProcedureSteps` — the ONE derivation), set
   * ONLY when this is the controller-active line. Stamped as `data-active-step`
   * so the unlayered globals.css rule lights the segment / condition the dock is
   * asking for — the moving outline. `null` on settled / non-active lines →
   * nothing lights. Never a local `useState`.
   */
  activeStep?: string | null;
  disabled?: boolean;
  saved?: ReadonlyArray<SavedSerial>;
  onAddSerial: (sn: string) => void | Promise<void>;
  onReplaceSerial?: (original: SavedSerial, nextSerial: string) => void;
  onMarkNoSerial?: () => void;
  noSerialSlot?: ReactNode;
  lookupBusy?: boolean;
  editingSerial?: SavedSerial | null;
  onEditingSerialChange?: (serial: SavedSerial | null) => void;
  autoFocusSerial?: boolean;
  focusKey?: string | number | null;
  /** Optional: notify parent when the serial panel opens. */
  onSerialPanelOpen?: () => void;
  /** Ungraded active line — stamp default USED_A once on mount (optimistic). */
  autoCommitDefaultGrade?: boolean;
  /**
   * Promote this PO line to the workspace controller before arming serial
   * (sibling capture faces share paint but not `data-active-step` / sink until
   * selected). Called from Tags click · serial segment · condition pick · row
   * press — never gates the local focus itself.
   */
  onArmCapture?: () => void;
}) {
  const photosDone = photoCount > 0;
  const photosAvailable =
    showPhotos &&
    receivingId != null &&
    receivingId > 0 &&
    lineId != null &&
    lineId > 0;
  // Fresh scan: serial panel open so the operator can wedge immediately.
  const [openPanel, setOpenPanel] = useState<'serial' | 'photos' | null>('serial');
  // Always start collapsed — hover Tags to expand; pick collapses again.
  const [condExpanded, setCondExpanded] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const displayCondition =
    String(condition || '').trim() || CAPTURE_DEFAULT_GRADE;

  useEffect(() => {
    if (editingSerial) setOpenPanel('serial');
  }, [editingSerial]);

  // Arm serial on mount (new scan / line paint) — optimistic, no DB wait.
  // Optional default-grade commit so procedure + Tags face agree immediately.
  const didArmRef = useRef(false);
  useEffect(() => {
    if (didArmRef.current) return;
    didArmRef.current = true;
    onSerialPanelOpen?.();
    if (autoCommitDefaultGrade) {
      onConditionChange(displayCondition);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only arm
  }, []);

  const focusSerialInRow = () => {
    const el = rowRef.current?.querySelector<HTMLInputElement>(
      '[data-unbox-serial-input]:not([disabled])',
    );
    el?.focus({ preventScroll: true });
  };

  // Focus rules:
  //  - Controller mount (`autoFocusSerial` + focusNonce 0): win dock race.
  //  - Any later openSerial (focusNonce > 0): focus THIS row even when the
  //    sibling is not yet the controller — local click must not wait on select.
  useEffect(() => {
    if (openPanel !== 'serial' || condExpanded || disabled) return;
    if (!autoFocusSerial && focusNonce === 0) return;
    const t = window.setTimeout(() => {
      const root = rowRef.current;
      const el = root?.querySelector<HTMLInputElement>(
        '[data-unbox-serial-input]:not([disabled])',
      );
      if (el) {
        el.focus({ preventScroll: true });
        return;
      }
      if (autoFocusSerial) focusUnboxCaptureSerial();
    }, 80);
    return () => window.clearTimeout(t);
  }, [
    autoFocusSerial,
    focusKey,
    focusNonce,
    displayCondition,
    openPanel,
    condExpanded,
    disabled,
  ]);

  const openSerial = () => {
    onArmCapture?.();
    setOpenPanel('serial');
    setCondExpanded(false);
    setFocusNonce((n) => n + 1);
    onSerialPanelOpen?.();
    // Local focus must not wait for controller promotion / active-step paint.
    requestAnimationFrame(() => {
      requestAnimationFrame(focusSerialInRow);
    });
    // Belt-and-suspenders for a SIBLING promotion: `onArmCapture` re-seeds the
    // workspace controller (dispatchSelectLine), which re-renders the accordion
    // and can drop the immediate rAF focus in a race. Re-focus THIS line's own
    // serial by DOM id after the re-render settles — never the controller dock.
    if (lineId != null) scheduleFocusUnboxCaptureSerialInLine(lineId, 90);
  };

  const openPhotos = () => {
    if (!photosAvailable) return;
    onArmCapture?.();
    setOpenPanel('photos');
    setCondExpanded(false);
  };

  /** Condition pick always selects + collapses Tags + advances to serial. */
  const handleConditionPick = (grade: string) => {
    onConditionChange(grade);
    setCondExpanded(false);
    openSerial();
  };

  const serialOpen = openPanel === 'serial';
  const photosOpen = openPanel === 'photos';
  // While condition pills are open, keep only the compact Serial / Photos
  // icon segments — the full serial field is too wide for the shared row.
  const showSerialField = serialOpen && !condExpanded;
  const showPhotosStrip = photosOpen && !condExpanded;

  /** Click the capture face (outside Tags / Photos) → focus serial. */
  const onRowMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!showSerialField || disabled) return;
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (t.closest('[data-capture-condition]')) return;
    if (t.closest('[data-capture-segment="photos"]')) return;
    if (t.closest('input, textarea, [contenteditable="true"]')) return;
    onArmCapture?.();
    // Let the click land, then pull focus into serial.
    requestAnimationFrame(focusSerialInRow);
  };

  const segmentFor = (key: CaptureSegmentKey) => {
    if (key === 'photos' && !photosAvailable) return null;
    // Open field/strip hides its icon — but while pills expand, both icons stay.
    if (key === 'serial' && showSerialField) return null;
    if (key === 'photos' && showPhotosStrip) return null;

    const { Glyph, hint, count, onClick } =
      key === 'serial'
        ? {
            Glyph: ScanBarcode,
            hint: noSerialActive
              ? 'Marked as having no serial — edit serial'
              : latestSerial
                ? `Serial ${latestSerial} — edit serial`
                : 'Serial number — scan or type',
            count: null as number | null,
            onClick: () => {
              setCondExpanded(false);
              openSerial();
            },
          }
        : {
            Glyph: Camera,
            hint: photosDone
              ? `${photoCount} item photo${photoCount === 1 ? '' : 's'} — edit photos`
              : 'Photos — Link, Upload, or Send to phone',
            count: photosDone ? photoCount : null,
            onClick: openPhotos,
          };

    return (
      <HoverTooltip key={key} label={hint} asChild>
        <button
          type="button"
          aria-label={hint}
          data-capture-segment={key}
          data-capture-filled={
            (key === 'serial' ? serialDone : photosDone) || undefined
          }
          disabled={disabled}
          className={captureSegmentClass({ key, open: false })}
          onClick={onClick}
        >
          <Glyph className={PO_LINE_CAPTURE_GLYPH_CLASS} />
          {count != null ? (
            <span className={PO_LINE_CAPTURE_COUNT_CLASS}>{count}</span>
          ) : null}
        </button>
      </HoverTooltip>
    );
  };

  const serialField = showSerialField ? (
    <div className="flex min-w-0 flex-1 items-stretch" data-capture-serial>
      <SerialScanField
        saved={saved}
        onAdd={onAddSerial}
        disabled={disabled}
        onReplaceSerial={onReplaceSerial}
        onMarkNoSerial={onMarkNoSerial}
        noSerialActive={noSerialActive}
        noSerialSlot={noSerialSlot}
        lookupBusy={lookupBusy}
        appearance="flush"
        autoFocusInput={autoFocusSerial || focusNonce > 0}
        focusKey={
          focusKey != null
            ? `${focusKey}-${focusNonce}`
            : `serial-open-${focusNonce}`
        }
        editingSerial={editingSerial}
        onEditingSerialChange={onEditingSerialChange}
      />
    </div>
  ) : null;

  const photosStrip = showPhotosStrip ? (
    <ItemPhotoCaptureStrip
      receivingId={receivingId!}
      lineId={lineId!}
      staffId={staffId}
      poRef={poRef}
      poRouteRef={poRouteRef}
      hostMarker="data-po-line-item-photos"
      emptyFallback={false}
    />
  ) : null;

  // Collapsed Tags + serial field, or expanded pills + icon segments.
  // Condition hover never drops the Serial / Photos icon buttons.
  const midAndSegments = showSerialField
    ? (
        <>
          {serialField}
          {CAPTURE_SEGMENT_ORDER.map(segmentFor)}
        </>
      )
    : showPhotosStrip
      ? (
          <>
            {segmentFor('serial')}
            {photosStrip}
          </>
        )
      : CAPTURE_SEGMENT_ORDER.map(segmentFor);

  return (
    <div
      ref={rowRef}
      className="w-full min-w-0 group"
      data-capture-row
      data-capture-serial-open={showSerialField || undefined}
      data-capture-photos-open={showPhotosStrip || undefined}
      data-capture-condition-expanded={condExpanded || undefined}
      data-active-step={activeStep ?? undefined}
      onMouseDown={onRowMouseDown}
    >
      <div className={PO_LINE_CAPTURE_ROW_CLASS}>
        <div
          className={cn(
            PO_LINE_CAPTURE_CONDITION_CLASS,
            // Expanded pills take the free width; Serial + Photos stay as w-11 icons.
            condExpanded ? 'min-w-0 flex-1' : 'shrink-0',
          )}
          data-capture-condition
        >
          <ConditionPills
            value={displayCondition}
            onChange={handleConditionPick}
            labelVariant="full"
            layout="barDistribute"
            collapsible
            startCollapsed
            expanded={condExpanded}
            onExpandedChange={setCondExpanded}
            onCollapsedClick={() => {
              // Units/Tags face press → arm serial (hover still expands grades).
              openSerial();
            }}
          />
        </div>
        {midAndSegments}
      </div>
    </div>
  );
}
