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
import { cn } from '@/utils/_cn';
import { PO_LINE_HEADER_FACE } from '@/components/receiving/workspace/station-scan-face';
import { UNFOUND_PO_DISPLAY } from '@/lib/receiving/po-group-title';

/**
 * Empty unfound carton — "scan the first return" affordance.
 *
 * Nested-grid anatomy: size-20 thumb in the title + details band (expands that
 * row), then serial body with condition · serial · trailing. SKU uses the mono
 * `----` empty face until a return / catalog import fills a real SKU.
 *
 * Shown only when the carton has 0 lines, so it never stands beside a line row.
 *
 * Packing also imports this chrome for unknown-order sessions (`body="none"`)
 * so the empty pack checklist matches Unbox's Unfound PO accordion row.
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
}: {
  condition: string;
  onConditionChange: (next: string) => void;
  onAdd: (serial: string) => void;
  serialAbsent?: boolean;
  serialAbsentReason?: string | null;
  requireSerialConfirmation?: boolean;
  onSerialAbsentChange?: (next: { absent: boolean; reason: string | null }) => void;
  /** Line title above the meta row — defaults to the unfound stub label. */
  title?: string;
  /**
   * `serial` — Unbox return-scan body (default).
   * `none` — chrome only (packing unknown-order empty row).
   */
  body?: 'serial' | 'none';
}) {
  return (
    <div
      className={cn(
        'relative min-w-0 overflow-hidden rounded-none border-0 border-b border-border-soft',
        QUEUE_ROW.selectedStationClass,
      )}
      aria-current="true"
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
            <SerialCard
              embedded
              saved={[]}
              expected={null}
              isSubmitting={false}
              showSavedChips={false}
              condition={condition}
              onConditionChange={onConditionChange}
              onAdd={onAdd}
              noSerialActive={serialAbsent ?? false}
              onMarkNoSerial={
                onSerialAbsentChange
                  ? () =>
                      onSerialAbsentChange(
                        serialAbsent
                          ? { absent: false, reason: null }
                          : { absent: true, reason: serialAbsentReason ?? 'NOT_SERIALIZED' },
                      )
                  : undefined
              }
              noSerialSlot={
                onSerialAbsentChange ? (
                  // fullWidth + hideClear: the committed bar fills the field (same
                  // width as the Serial input) and the SerialCard trailing green-check
                  // owns the on/off toggle — so "checked" and "acknowledged" stay
                  // the same width.
                  <NoSerialControl
                    absent
                    fullWidth
                    hideClear
                    reason={serialAbsentReason ?? null}
                    required={requireSerialConfirmation ?? false}
                    onChange={onSerialAbsentChange}
                  />
                ) : undefined
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
