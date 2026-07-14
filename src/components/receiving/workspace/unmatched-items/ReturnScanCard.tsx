'use client';

import { SerialCard } from '@/components/receiving/workspace/SerialCard';
import { NoSerialControl } from '@/components/receiving/workspace/line-edit/NoSerialControl';

/**
 * The unfound carton's "scan a return serial" entry — a regular unbox serial
 * card (white chrome + condition pills) whose scan runs the carton-level
 * create-line→attach flow (`handleReturnSerialScan`). On a shipped match it
 * imports the sales order and populates the line; when there is no order match
 * the serial is still recorded and flagged for triage.
 *
 * Feedback is the surface swap itself: optimistic line + serial chip mount in
 * the accordion immediately — there is no inline recording loader.
 *
 * Extracted from {@link UnmatchedItemsSection} so the legacy list body and the
 * unified accordion surface render the identical scanner (plan Phase 2). In the
 * unified surface it is the empty-carton "scan the first return" affordance —
 * shown only when the carton has 0 lines, so it never stands beside a line row.
 */
export function ReturnScanCard({
  condition,
  onConditionChange,
  onAdd,
  serialAbsent,
  serialAbsentReason,
  requireSerialConfirmation,
  onSerialAbsentChange,
}: {
  condition: string;
  onConditionChange: (next: string) => void;
  onAdd: (serial: string) => void;
  serialAbsent?: boolean;
  serialAbsentReason?: string | null;
  requireSerialConfirmation?: boolean;
  onSerialAbsentChange?: (next: { absent: boolean; reason: string | null }) => void;
}) {
  return (
    <SerialCard
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
          // fullWidth + hideClear: the committed bar fills the field (same width
          // as the Serial input) and the SerialCard trailing green-check owns the
          // on/off toggle — so "checked" and "acknowledged" stay the same width.
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
  );
}
