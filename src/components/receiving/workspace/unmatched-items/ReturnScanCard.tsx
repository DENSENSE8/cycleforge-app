'use client';

import { useMemo } from 'react';
import { SerialCard } from '@/components/receiving/workspace/SerialCard';
import { PoLineRow } from '@/components/receiving/workspace/PoLineRow';
import { NoSerialControl } from '@/components/receiving/workspace/line-edit/NoSerialControl';
import { PoLineCaptureRow } from '@/components/receiving/workspace/line-edit/PoLineCaptureRow';
import { resolveCaptureEntry } from '@/components/receiving/workspace/line-receive-mode';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  UNFOUND_PO_DISPLAY,
  UNFOUND_PO_SENTINEL,
} from '@/lib/receiving/po-group-title';

/**
 * Empty unfound carton — "scan the first return" affordance.
 *
 * Ledger face is Unbox {@link PoLineRow} (thumb · title · five-track meta) —
 * never a hand-built meta twin. Capture mounts as that row's body (same nest
 * as found lines) when {@link body} is `serial` and {@link unitsChrome} is
 * true; Arrival door flow keeps unitsChrome false so this card is face-only.
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
  unitsChrome = true,
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
  /**
   * When false (Arrival door flow), paint PoLineRow face only — no serial
   * capture under the row. Defaults true (Unbox / packing scan-first).
   */
  unitsChrome?: boolean;
}) {
  const showCapture = unitsChrome && body === 'serial';
  const captureRow =
    showCapture &&
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

  const stubLine = useMemo<ReceivingLineRow>(() => {
    // Map operator "Unfound order" back to the DB sentinel so
    // receivingWorkspaceLineTitle → UNFOUND_PO_DISPLAY (same as lined stubs).
    const itemName =
      title === UNFOUND_PO_DISPLAY || title === UNFOUND_PO_SENTINEL
        ? UNFOUND_PO_SENTINEL
        : title;
    return {
      id: receivingId != null && receivingId > 0 ? -receivingId : -1,
      receiving_id: receivingId != null && receivingId > 0 ? receivingId : null,
      tracking_number: null,
      carrier: null,
      zoho_item_id: null,
      zoho_line_item_id: null,
      zoho_purchase_receive_id: null,
      zoho_purchaseorder_id: null,
      zoho_purchaseorder_number: null,
      item_name: itemName,
      sku: null,
      quantity_received: 0,
      quantity_expected: 1,
      qa_status: 'PENDING',
      workflow_status: 'ARRIVED',
      disposition_code: 'HOLD',
      condition_grade: condition || 'USED_A',
      disposition_audit: [],
      needs_test: true,
      assigned_tech_id: null,
      zoho_sync_source: null,
      zoho_last_modified_time: null,
      zoho_synced_at: null,
      receiving_type: 'PO',
      notes: null,
      created_at: null,
      last_activity_at: null,
      image_url: null,
      source_platform: null,
      receiving_source: 'unmatched',
      serials: [],
      unit_price: null,
      serial_absent: serialAbsent ?? false,
      serial_absent_reason: serialAbsentReason ?? null,
    };
  }, [
    condition,
    receivingId,
    serialAbsent,
    serialAbsentReason,
    title,
  ]);

  return (
    <div
      className="relative min-w-0"
      aria-current="true"
      data-return-scan-capture={captureRow || undefined}
      data-receiving-id={receivingId != null && receivingId > 0 ? receivingId : undefined}
      data-staff-id={staffId > 0 ? staffId : undefined}
    >
      <ul className="flex min-w-0 flex-col gap-0">
        <PoLineRow
          line={stubLine}
          isActive
          readOnly
          unitsChrome={unitsChrome}
          animateLayout={false}
          activeRowSlot={
            showCapture
              ? () => (
                  <div data-po-line-unit-capture className="min-w-0">
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
                )
              : undefined
          }
        />
      </ul>
    </div>
  );
}
