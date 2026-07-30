'use client';

import { ChevronDown } from '@/components/Icons';
import { ConditionGradeChip, EmptySkuChipFace } from '@/components/ui/CopyChip';
import { META_COL } from '@/components/ui/RowMetaColumns';
import { SerialCard } from '@/components/receiving/workspace/SerialCard';
import { ProgressBadge } from '@/components/receiving/workspace/PoLineBadges';
import { PoLineMetaGrid } from '@/components/receiving/workspace/PoLineMetaGrid';
import { NoSerialControl } from '@/components/receiving/workspace/line-edit/NoSerialControl';

/**
 * Empty unfound carton — "scan the first return" affordance.
 *
 * Same row anatomy as a matched {@link PoLineRow}: title · qty | SKU | condition
 * meta · serial body. The SKU slot uses the mono `----` empty face until a return /
 * catalog import fills a real SKU. Scan runs the carton-level create-line→attach
 * flow (`handleReturnSerialScan`); on a shipped match it imports the sales order
 * and populates the line.
 *
 * Feedback is the surface swap itself: optimistic line + serial chip mount in
 * the accordion immediately — there is no inline recording loader.
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
  title = 'Unfound PO',
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
      className="relative min-w-0 overflow-hidden rounded-xl border border-blue-300 bg-blue-50/60"
      aria-current="true"
    >
      <div className="w-full min-w-0 px-3 pb-1 pt-1 text-left">
        {/* Title row — same disclosure track + bold title as PoLineRow. */}
        <div className="flex min-w-0 items-center">
          <span
            className={`flex shrink-0 items-center justify-center ${META_COL.dotTrackWide}`}
          >
            <ChevronDown className="h-3.5 w-3.5 text-text-faint" aria-hidden />
          </span>
          <p
            className="min-w-0 flex-1 truncate text-role-caption font-semibold text-text-default"
            title={title}
          >
            {title}
          </p>
        </div>
        {/* Meta — qty | empty SKU (----) | condition (same columns as matched rows). */}
        <PoLineMetaGrid
          qty={<ProgressBadge received={0} expected={1} />}
          sku={<EmptySkuChipFace dense />}
          condition={<ConditionGradeChip grade={condition} dense />}
        />
      </div>
      {body === 'serial' ? (
        <div className="min-w-0 overflow-hidden border-t border-blue-200/60">
          <div className="min-w-0 px-3 pb-1 pt-1">
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
