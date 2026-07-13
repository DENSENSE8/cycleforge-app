'use client';

import { Loader2 } from '@/components/Icons';
import { SerialCard } from '@/components/receiving/workspace/SerialCard';
import { NoSerialControl } from '@/components/receiving/workspace/line-edit/NoSerialControl';

/**
 * The unfound carton's "scan a return serial" entry — a regular unbox serial
 * card (white chrome + condition pills) whose scan runs the carton-level
 * lookup→create-line→attach flow (`handleReturnSerialScan`). On a shipped match
 * it imports the sales order and populates the line; while it runs the card
 * shows an inline importing loader (the import IS the result — no match band).
 *
 * Extracted from {@link UnmatchedItemsSection} so the legacy list body and the
 * unified accordion surface render the identical scanner (plan Phase 2). In the
 * unified surface it is the empty-carton "scan the first return" affordance —
 * shown only when the carton has 0 lines, so it never stands beside a line row.
 */
export function ReturnScanCard({
  isSubmitting,
  condition,
  onConditionChange,
  onAdd,
  serialAbsent,
  serialAbsentReason,
  requireSerialConfirmation,
  onSerialAbsentChange,
}: {
  isSubmitting: boolean;
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
      isSubmitting={isSubmitting}
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
          <NoSerialControl
            absent
            reason={serialAbsentReason ?? null}
            required={requireSerialConfirmation ?? false}
            onChange={onSerialAbsentChange}
          />
        ) : undefined
      }
      resultSlot={
        // Importing loader — the only feedback surface for the scan. On success
        // the imported line row (and the bound PO# / platform chips) ARE the
        // result; no match band.
        isSubmitting ? (
          <div className="flex items-center gap-2 rounded-lg border border-border-soft bg-surface-canvas px-3 py-2 text-role-caption font-bold uppercase tracking-wider text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
            Matching serial — importing the sales order…
          </div>
        ) : undefined
      }
    />
  );
}
