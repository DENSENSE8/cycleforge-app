'use client';

import { useCallback, useState } from 'react';
import { Trash2 } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { toast } from '@/lib/toast';
import { SerialChipWithMenu } from '@/components/receiving/workspace/SerialCard';
import {
  useSerialLookup,
  type SerialMatchedOrder,
} from '@/components/receiving/workspace/SerialMatchResult';
import { dispatchLineUpdated } from '@/components/station/ReceivingLinesTable';
import {
  ConditionGradeChip,
  EmptySkuChipFace,
  SkuScanRefChip,
  getLast4,
} from '@/components/ui/CopyChip';
import { ProgressBadge } from '@/components/receiving/workspace/PoLinesAccordion';
import type { ActiveRowSerial } from '@/components/receiving/workspace/PoLinesAccordion';
import { PoLineMetaGrid } from '@/components/receiving/workspace/PoLineMetaGrid';
import { ActiveLineConditionSerial } from '@/components/receiving/workspace/line-edit/ActiveLineConditionSerial';
import type { SerialAbsentState } from '@/components/receiving/workspace/line-edit/NoSerialControl';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { requestConfirm } from '@/design-system/components/confirm';
import type { UnfoundLine, UnmatchedLineRenderHelpers } from './unmatched-items-shared';

interface UnmatchedLineRowProps {
  line: UnfoundLine;
  receivingId: number;
  staffId?: string;
  receivingType: string;
  onConditionChange: (lineId: number, condition: string) => Promise<void>;
  onRemove: (lineId: number) => Promise<void>;
  onFileReturnClaim?: (matchedOrder: SerialMatchedOrder | null, serial: string) => void;
  /** Report the active/selected unit's grade up so the label preview tracks it (matched parity). */
  onActiveConditionChange?: (condition: string) => void;
  /** No-serial waiver, owned by the unbox controller (carton-level) — matched parity. */
  serialAbsent?: boolean;
  serialAbsentReason?: string | null;
  requireSerialConfirmation?: boolean;
  onSerialAbsentChange?: (next: SerialAbsentState) => void;
  /**
   * When provided, replaces the default ConditionPills with a caller-rendered
   * action area. Receives the same helpers the default renderer uses so the
   * caller can still trigger condition changes from inside its custom UI.
   */
  renderActions?: (helpers: UnmatchedLineRenderHelpers) => React.ReactNode;
  refresh: () => void;
}

export function UnmatchedLineRow({
  line,
  receivingId,
  staffId,
  receivingType,
  onConditionChange,
  onRemove,
  onFileReturnClaim,
  onActiveConditionChange,
  serialAbsent,
  serialAbsentReason,
  requireSerialConfirmation,
  onSerialAbsentChange,
  renderActions,
  refresh,
}: UnmatchedLineRowProps) {
  const [updating, setUpdating] = useState(false);
  const [serialSubmitting, setSerialSubmitting] = useState(false);
  // In-place serial edit target (chip menu → edit → SerialCard shows the edit
  // input), mirroring the matched carton's `headerSerialEdit` state.
  const [editingSerial, setEditingSerial] = useState<ActiveRowSerial | null>(null);
  // Per-line serial-match lookup for the RETURN flow — mirrors the matched
  // carton's SerialCard behavior so an unfound return can be paired to the
  // order it shipped on.
  const serialLookup = useSerialLookup();
  const isReturn = String(receivingType || '').toUpperCase() === 'RETURN';
  const saved = (line.serials ?? []) as ActiveRowSerial[];

  // Submit a serial against this unfound line. Runs the return lookup first
  // (so it reflects prior inventory, not the row we're about to write), then
  // POSTs the scan and refreshes the carton so the new chip + qty land. The
  // optional `conditionGrade` lets the multi-qty branch stamp each scan with
  // the grade chosen for that slot (single-qty falls back to the line grade).
  const submitSerial = useCallback(
    async (raw?: string, conditionGrade?: string | null) => {
      const serial = (raw ?? '').trim();
      if (!serial || serialSubmitting) return;
      setSerialSubmitting(true);
      try {
        if (isReturn) await serialLookup.check(serial);
        const res = await fetch('/api/receiving/scan-serial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiving_id: receivingId,
            receiving_line_id: line.id,
            serial_number: serial,
            staff_id: Number(staffId) || undefined,
            condition_grade: conditionGrade ?? line.condition_grade ?? undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          toast.error(json?.error || 'Scan failed');
          return;
        }
        dispatchLineUpdated({ id: line.id });
        refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Scan failed');
      } finally {
        setSerialSubmitting(false);
      }
    },
    [isReturn, line.condition_grade, line.id, receivingId, refresh, serialLookup, serialSubmitting, staffId],
  );

  // Delete a serial by id (no confirm — ActiveLineConditionSerial owns the
  // settings-gated confirm before it calls this). The meta-line chip delete
  // keeps its own confirm via `deleteSerial` below.
  const deleteSerialUnit = useCallback(
    async (serialUnitId: number) => {
      if (serialUnitId == null) return;
      try {
        const res = await fetch('/api/receiving/scan-serial', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serial_unit_id: serialUnitId, receiving_line_id: line.id }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          toast.error(json?.error || 'Could not remove serial');
          return;
        }
        if (editingSerial?.id === serialUnitId) setEditingSerial(null);
        refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not remove serial');
      }
    },
    [editingSerial?.id, line.id, refresh],
  );

  // Delete a serial from the meta-line chip menu — keeps the confirm prompt the
  // chip has always shown (ActiveLineConditionSerial's editor does its own).
  const deleteSerialChip = useCallback(
    async (serial: { id?: number; serial_number: string }) => {
      if (serial.id == null) return;
      const ok = await requestConfirm({
        description: `Remove serial ${serial.serial_number}?`,
        tone: 'danger',
        confirmLabel: 'Remove',
      });
      if (!ok) return;
      await deleteSerialUnit(serial.id);
    },
    [deleteSerialUnit],
  );

  // Replace a serial in place (typo fix): delete then re-scan, preserving the
  // unit's condition grade — matched parity via useLineSerials.replaceSerialUnit.
  const replaceSerialUnit = useCallback(
    async (
      original: { id: number; serial_number: string; condition_grade?: string | null },
      nextSerial: string,
    ) => {
      if (original.id == null) return;
      const next = (nextSerial ?? '').trim();
      if (!next || next === original.serial_number) return;
      try {
        const res = await fetch('/api/receiving/scan-serial', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serial_unit_id: original.id, receiving_line_id: line.id }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success) {
          toast.error(json?.error || 'Could not replace serial');
          return;
        }
        await submitSerial(next, original.condition_grade ?? null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not replace serial');
      }
    },
    [line.id, submitSerial],
  );

  // Persist a per-unit condition grade on an already-scanned serial_unit (409 =
  // "no change", ignored) — matched parity via useLineSerials.setUnitGrade.
  const setUnitGrade = useCallback(
    async (serialUnitId: number, grade: string) => {
      try {
        const res = await fetch(`/api/serial-units/${serialUnitId}/grade`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_grade: grade }),
        });
        if (res.status === 409) return;
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          toast.error(json?.error || 'Could not set unit condition');
          return;
        }
        refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Condition save failed');
      }
    },
    [refresh],
  );

  const handleCondition = useCallback(
    async (next: string) => {
      if (next === line.condition_grade) return;
      setUpdating(true);
      try {
        await onConditionChange(line.id, next);
      } finally {
        setUpdating(false);
      }
    },
    [line.condition_grade, line.id, onConditionChange],
  );

  return (
    <div className="rounded-xl border border-blue-300 bg-blue-50/60 p-3">
      <div className="flex items-start gap-3">
        {line.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={line.image_url}
            alt=""
            className="h-12 w-12 shrink-0 rounded border border-blue-100 object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-role-caption font-semibold text-text-default">
            {line.item_name ?? line.sku ?? `Line ${line.id}`}
          </div>
          {/* Same fixed-column meta as PoLineRow: qty | SKU | condition | serial. */}
          <PoLineMetaGrid
            indent="0px"
            qty={
              <ProgressBadge
                received={line.quantity_received ?? 0}
                expected={line.quantity_expected ?? 1}
              />
            }
            sku={
              (line.sku || '').trim() ? (
                <SkuScanRefChip value={line.sku as string} display={getLast4(line.sku)} dense />
              ) : (
                <EmptySkuChipFace dense />
              )
            }
            condition={<ConditionGradeChip grade={line.condition_grade} dense />}
            serial={
              saved.length > 0 ? (
                <span className="flex min-w-0 flex-wrap items-center gap-1">
                  {saved.map((s, i) => {
                    const sn = (s.serial_number || '').trim();
                    if (!sn) return null;
                    // Menu chip (delete/edit on hover) — the ONLY serial display
                    // on the row; ActiveLineConditionSerial below has its saved
                    // chips off so the serial isn't shown twice.
                    return (
                      <SerialChipWithMenu
                        key={`${sn}-${i}`}
                        serial={s}
                        dense
                        isEditing={editingSerial?.id != null && editingSerial.id === s.id}
                        onEdit={(target) => setEditingSerial(target as ActiveRowSerial)}
                        onDelete={(target) => void deleteSerialChip(target)}
                      />
                    );
                  })}
                </span>
              ) : undefined
            }
          />
        </div>
        {/* Right-edge trash — removes the line via DELETE /api/receiving-lines.
            Confirms before deleting so an accidental tap doesn't lose work. */}
        <HoverTooltip label="Remove item" asChild>
          <IconButton
            icon={<Trash2 className="h-4 w-4" />}
            onClick={() => void onRemove(line.id)}
            ariaLabel="Remove item"
            className="shrink-0 self-start rounded-md p-1.5 text-text-faint hover:bg-rose-50 hover:text-rose-600"
          />
        </HoverTooltip>
      </div>
      <div className="mt-3 border-t border-blue-200/60 pt-3">
        <div
          className={updating ? 'pointer-events-none opacity-60' : undefined}
          aria-busy={updating || undefined}
        >
          {renderActions ? (
            renderActions({
              onConditionChange: (next) => {
                void handleCondition(next);
              },
              refresh,
            })
          ) : (
            // Same condition + serial editor as a matched PO line — one leaf for
            // both surfaces (Kinetic Ledger: one row anatomy). Multi-qty and
            // single-qty branches now behave identically to the matched carton.
            <ActiveLineConditionSerial
              serials={saved}
              lineId={line.id}
              receivingId={receivingId}
              quantityExpected={line.quantity_expected ?? null}
              cond={line.condition_grade}
              serialSubmitting={serialSubmitting}
              editingSerial={editingSerial}
              serialLookup={serialLookup}
              onFileReturnClaim={
                onFileReturnClaim
                  ? (mo) => onFileReturnClaim(mo, serialLookup.serial)
                  : undefined
              }
              onSubmitSerial={(sn, grade) => submitSerial(sn, grade)}
              onDeleteSerialUnit={(id) => void deleteSerialUnit(id)}
              onReplaceSerialUnit={(original, next) => void replaceSerialUnit(original, next)}
              onSetUnitGrade={(id, grade) => void setUnitGrade(id, grade)}
              onActiveConditionChange={(next) => {
                if (next) onActiveConditionChange?.(next);
              }}
              onConditionChange={(next) => {
                void handleCondition(next);
              }}
              onEditingSerialChange={setEditingSerial}
              serialAbsent={serialAbsent ?? false}
              serialAbsentReason={serialAbsentReason ?? null}
              requireSerialConfirmation={requireSerialConfirmation ?? false}
              onSerialAbsentChange={(next) => onSerialAbsentChange?.(next)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
