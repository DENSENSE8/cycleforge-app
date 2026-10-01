'use client';

/** Unbox PO-line capture composer — one joined bar under the active line. */

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Camera, ScanBarcode } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/design-system/primitives/Button';
import { cn } from '@/utils/_cn';
import {
  CAPTURE_SEGMENT_ORDER,
  PO_LINE_CAPTURE_ACTION_WIDTH,
  PO_LINE_CAPTURE_ACTIONS_CLASS,
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
  /** The dock's `activeKey` (`useUnboxProcedureSteps` — the ONE derivation), set ONLY when this is the controller-active line. */
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
  /** Promote this PO line to the workspace controller before arming serial (sibling capture faces share paint but not `data-active-step` /… */
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
  // Dupe-scan notice.
  const [scanNotice, setScanNotice] = useState<string | null>(null);
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

  // Focus rules: - Controller mount (`autoFocusSerial` + focusNonce 0):
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
    // Belt-and-suspenders for a SIBLING promotion:
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
              : 'Photos — Upload or send to phone',
            count: photosDone ? photoCount : null,
            onClick: openPhotos,
          };

    return (
      <HoverTooltip key={key} label={hint} asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          radius="flush"
          ariaLabel={hint}
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
        </Button>
      </HoverTooltip>
    );
  };

  /** Field + trailing actions. */
  const serialField = showSerialField ? (
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
      actionWidth={PO_LINE_CAPTURE_ACTION_WIDTH}
      actionsSlot={segmentFor('photos')}
      onInlineNoticeChange={setScanNotice}
      autoFocusInput={autoFocusSerial || focusNonce > 0}
      focusKey={
        focusKey != null
          ? `${focusKey}-${focusNonce}`
          : `serial-open-${focusNonce}`
      }
      editingSerial={editingSerial}
      onEditingSerialChange={onEditingSerialChange}
    />
  ) : null;

  // Already `flex-1` in its own chrome (PhotoStepDockStrip), so it takes the
  // middle exactly as the Serial field does — see PO_LINE_CAPTURE_FIELD_CLASS.
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
  // Condition hover never drops the Serial / Photos icon buttons — they just
  // move from beside the field into the same trailing cluster.
  const midAndSegments = showSerialField
    ? serialField
    : showPhotosStrip
      ? (
          <>
            {photosStrip}
            <div className={PO_LINE_CAPTURE_ACTIONS_CLASS}>
              {segmentFor('serial')}
            </div>
          </>
        )
      : (
          <div className={PO_LINE_CAPTURE_ACTIONS_CLASS}>
            {CAPTURE_SEGMENT_ORDER.map(segmentFor)}
          </div>
        );

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
      <div className={PO_LINE_CAPTURE_ROW_CLASS} data-capture-composer>
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
      {scanNotice ? (
        <p
          role="status"
          className="bg-surface-card px-3 py-1 text-role-caption font-semibold text-rose-600"
        >
          {scanNotice}
        </p>
      ) : null}
    </div>
  );
}
