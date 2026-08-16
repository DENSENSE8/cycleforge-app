'use client';

import { ChevronDown } from '@/components/Icons';
import { ConditionGradeChip, EmptySkuChipFace, UnitPriceChip } from '@/components/ui/CopyChip';
import { META_COL } from '@/components/ui/RowMetaColumns';
import { QUEUE_ROW } from '@/components/ui/queue-row-chrome';
import { SerialCard } from '@/components/receiving/workspace/SerialCard';
import { ProgressBadge } from '@/components/receiving/workspace/PoLineBadges';
import { PoLineMetaGrid } from '@/components/receiving/workspace/PoLineMetaGrid';
import { PoLineHeaderThumb } from '@/components/receiving/workspace/PoLineHeaderThumb';
import { NoSerialControl } from '@/components/receiving/workspace/line-edit/NoSerialControl';
import { PoLineCaptureRow } from '@/components/receiving/workspace/line-edit/PoLineCaptureRow';
import { cn } from '@/utils/_cn';
import { PO_LINE_HEADER_FACE } from '@/components/receiving/workspace/station-scan-face';
import { resolveCaptureEntry } from '@/components/receiving/workspace/line-receive-mode';
import { UNFOUND_PO_DISPLAY } from '@/lib/receiving/po-group-title';

/**
 * Empty unfound carton — "scan the first return" affordance.
 *
 * Unbox dual loci (`dockOwnsCapture`): same invariant capture face as found /
 * lined unfound — always-collapsed Tags (`USED_A`) + open Serial with autofocus.
 * Photos stays off until a real line exists (item-scoped strip needs a
 * receiving line id).
 */
export function ReturnScanCard({
  condition,
  onConditionChange,
  onAdd,
  serialAbsent,
  serialAbsentReason,
  requireSerialConfirmation,
  onSerialAbsentChange,
  title = UNFOUND_PO_DISPLAY,
  body = 'serial',
  dockOwnsCapture = false,
  receivingId = null,
  staffId = 0,
}: {
  condition: string;
  onConditionChange: (next: string) => void;
  onAdd: (serial: string) => void;
  serialAbsent?: boolean;
  serialAbsentReason?: string | null;
  requireSerialConfirmation?: boolean;
  onSerialAbsentChange?: (next: { absent: boolean; reason: string | null }) => void;
  title?: string;
  body?: 'serial' | 'none';
  dockOwnsCapture?: boolean;
  receivingId?: number | null;
  staffId?: number;
}) {
  const captureRow =
    body === 'serial' &&
    resolveCaptureEntry({
      dockOwnsCapture,
      receivingId,
      lineId: null,
      quantityExpected: 1,
      serialCount: 0,
    }) === 'capture-stub';

  const markNoSerial = onSerialAbsentChange
    ? () =>
        onSerialAbsentChange(
          serialAbsent
            ? { absent: false, reason: null }
            : {
                absent: true,
                reason: serialAbsentReason ?? 'NOT_SERIALIZED',
              },
        )
    : undefined;

  return (
    <div
      className={cn(
        'relative min-w-0 overflow-hidden rounded-none border-0 border-b border-border-soft',
        QUEUE_ROW.selectedStationClass,
      )}
      aria-current="true"
      data-return-scan-capture={captureRow || undefined}
      data-receiving-id={receivingId != null && receivingId > 0 ? receivingId : undefined}
      data-staff-id={staffId > 0 ? staffId : undefined}
    >
      <div className="w-full min-w-0 py-0 pl-0 pr-0 text-left">
        <div
          className={cn(
            'grid min-w-0',
            PO_LINE_HEADER_FACE.minH,
            PO_LINE_HEADER_FACE.thumbGrid,
          )}
        >
          <PoLineHeaderThumb />
          <div className="flex min-h-0 min-w-0 flex-col justify-between self-stretch">
            <div className="flex min-w-0 items-start px-2 py-1">
              <p className="min-w-0 flex-1 text-role-caption font-semibold leading-tight text-text-default">
                {title}
              </p>
              <span
                className={cn(
                  'flex shrink-0 items-center justify-center self-center',
                  META_COL.dotTrackWide,
                )}
                aria-hidden
              >
                <ChevronDown className="h-3.5 w-3.5 text-text-faint" />
              </span>
            </div>
            <PoLineMetaGrid
              qty={<ProgressBadge received={0} expected={1} />}
              sku={<EmptySkuChipFace dense />}
              condition={<ConditionGradeChip grade={condition} dense />}
              price={<UnitPriceChip amount={null} dense />}
            />
          </div>
        </div>
      </div>
      {body === 'serial' ? (
        <div className="min-w-0 overflow-hidden border-t border-border-hairline bg-surface-card">
          <div className="min-w-0 bg-surface-card px-0 py-0">
            {captureRow ? (
              <PoLineCaptureRow
                condition={condition || 'USED_A'}
                onConditionChange={onConditionChange}
                serialDone={serialAbsent ?? false}
                noSerialActive={serialAbsent ?? false}
                showPhotos={false}
                receivingId={receivingId}
                staffId={staffId}
                autoFocusSerial
                autoCommitDefaultGrade
                onAddSerial={onAdd}
                onMarkNoSerial={markNoSerial}
                noSerialSlot={
                  onSerialAbsentChange ? (
                    <NoSerialControl
                      absent
                      fullWidth
                      hideClear
                      reason={serialAbsentReason ?? null}
                      required={requireSerialConfirmation}
                      disabled={receivingId == null || receivingId <= 0}
                      onChange={onSerialAbsentChange}
                    />
                  ) : undefined
                }
              />
            ) : (
              <SerialCard
                embedded
                saved={[]}
                expected={null}
                isSubmitting={false}
                showSavedChips={false}
                autoFocusInput
                condition={condition}
                onConditionChange={onConditionChange}
                collapsedConditionLabel
                onAdd={onAdd}
                noSerialActive={serialAbsent ?? false}
                onMarkNoSerial={markNoSerial}
                noSerialSlot={
                  onSerialAbsentChange ? (
                    <NoSerialControl
                      absent
                      fullWidth
                      hideClear
                      reason={serialAbsentReason ?? null}
                      required={requireSerialConfirmation}
                      disabled={receivingId == null || receivingId <= 0}
                      onChange={onSerialAbsentChange}
                    />
                  ) : undefined
                }
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
