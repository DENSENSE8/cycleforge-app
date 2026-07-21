'use client';

/**
 * Serial-scanning domain for the LineEditPanel: attach / delete / replace /
 * grade serial_units on a receiving line, plus the canonical refetch that keeps
 * the table + sibling accordion rows in sync.
 *
 * Extracted verbatim from LineEditPanel (which was carrying ~170 lines of this
 * inline) so the panel composes a focused API instead of owning the scan flow.
 * Serials are sidecar metadata — they attach an item identity + condition to a
 * line and never touch quantity_received or stock (that's the Receive action).
 *
 * Behaviour is unchanged for scan attach/detach: same endpoints, same toasts,
 * same `receiving-serial-scanned` broadcast and narrow bus patches. Line-select
 * serial refresh uses {@link publishLineSerials} only — never a Testing-style
 * full by-id row dump onto `receiving-line-updated` (that blanks Unboxed ages).
 * RETURN-flow lookup ordering is unchanged (lookup runs BEFORE the upsert so it
 * reflects prior inventory rather than the row we're about to write).
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import {
  type ReceivingLineRow,
} from '@/components/station/ReceivingLinesTable';
import { dispatchUnboxRailLineUpdated } from '@/components/sidebar/receiving/unbox-rail-events';
import {
  patchUnboxRailTitleByCarton,
  receivingSiblingsQueryKey,
  publishLineSerials,
} from '@/lib/queries/receiving-queries';
import {
  appendOptimisticSerial,
  clearSerialRemoving,
  confirmOptimisticSerial,
  markSerialRemoving,
  mintOptimisticSerialId,
  removeSerialById,
  rollbackOptimisticSerial,
  setSerialGrade,
  type LineSerial,
} from '@/lib/receiving/optimistic-serials';
import type { useSerialLookup } from '../../SerialMatchResult';

interface UseLineSerialsArgs {
  row: ReceivingLineRow;
  staffId: string;
  receivingType: string;
  serialInput: string;
  setSerialInput: (v: string) => void;
  serialLookup: ReturnType<typeof useSerialLookup>;
  serialInputRef: RefObject<HTMLInputElement | null>;
}

export function useLineSerials({
  row,
  staffId,
  receivingType,
  serialInput,
  setSerialInput,
  serialLookup,
  serialInputRef,
}: UseLineSerialsArgs) {
  const queryClient = useQueryClient();
  const [serialSubmitting, setSerialSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const readLineSerials = useCallback(
    (lineId: number): LineSerial[] => {
      const receivingId = row.receiving_id;
      if (!receivingId) return [];
      const cached = queryClient.getQueryData<{
        success: boolean;
        receiving_lines: ReceivingLineRow[];
      }>(receivingSiblingsQueryKey(receivingId));
      const hit = cached?.receiving_lines?.find((l) => l.id === lineId);
      return (hit?.serials ?? []) as LineSerial[];
    },
    [queryClient, row.receiving_id],
  );

  const publish = useCallback(
    (lineId: number, serials: LineSerial[]) => {
      publishLineSerials(queryClient, row.receiving_id, lineId, serials);
    },
    [queryClient, row.receiving_id],
  );

  const refreshLineWithSerials = useCallback(async (lineId: number = row.id) => {
    try {
      const res = await fetch(`/api/receiving-lines?id=${lineId}&include=serials`);
      const data = await res.json();
      if (data?.success && data.receiving_line) {
        const line = data.receiving_line as ReceivingLineRow;
        // Serials are sidecar metadata. Do NOT dump the by-id row onto the
        // shared `receiving-line-updated` bus (Testing's refreshLineWithSerials
        // pattern). That response cannot reproduce Unboxed's `unbox_opened_at`
        // axis — normalizeRow fills null — and blanks the rail age on open /
        // return-serial attach. Accordion + rail chips take the narrow dual-write.
        publishLineSerials(
          queryClient,
          line.receiving_id ?? row.receiving_id,
          line.id,
          line.serials ?? [],
        );
      }
    } catch {
      /* silent */
    }
  }, [queryClient, row.id, row.receiving_id]);

  // Parent list (table / sibling accordion) may have stale `row.serials` —
  // it's fetched on a different cadence than the per-line workspace. Pull
  // fresh serials whenever the active line changes so SerialCard's chips +
  // "X/Y SCANNED" tally always agree with what the DB has for this line.
  useEffect(() => {
    void refreshLineWithSerials();
  }, [refreshLineWithSerials]);

  const submitSerial = useCallback(async (raw?: string, conditionGrade?: string | null) => {
    const serial = (raw ?? serialInput).trim();
    if (!serial || !row.receiving_id || submittingRef.current) return;
    const tempId = mintOptimisticSerialId();
    const optimisticSerials = appendOptimisticSerial(readLineSerials(row.id), serial, tempId);
    publish(row.id, optimisticSerials);

    submittingRef.current = true;
    setSerialSubmitting(true);
    try {
      // Serials are sidecar metadata: scanning attaches a serial_unit (the item
      // identity + its condition) to the line. Unlimited per line — a unit may
      // carry several serials. It does NOT change quantity_received or stock;
      // those are owned by the PO line item via the Receive action.

      // RETURN flow: surface whether this serial already exists in our records
      // (a genuine return matches a previously-shipped unit). The lookup MUST
      // run before the upsert below — otherwise it would match the row we're
      // about to write and always report "Match found".
      if (receivingType === 'RETURN') {
        await serialLookup.check(serial);
      }

      const postScan = async () => {
        const res = await fetch('/api/receiving/scan-serial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiving_id: row.receiving_id,
            receiving_line_id: row.id,
            serial_number: serial,
            staff_id: Number(staffId),
            // Per-unit grade (multi-qty rows stamp each scan with the grade
            // chosen for that slot). Omitted for the single-block path.
            condition_grade: conditionGrade ?? undefined,
          }),
        });
        const json = await res.json().catch(() => null);
        return { res, data: json };
      };

      const { res, data } = await postScan();

      if (!res.ok || !data?.success) {
        toast.error(data?.error || `Scan failed (${res.status})`);
        publish(row.id, rollbackOptimisticSerial(readLineSerials(row.id), tempId));
        return;
      }

      // Same serial already on this line — friendly no-op.
      if (data.already_attached) {
        toast.info(`Already added — ${serial}`);
        publish(row.id, rollbackOptimisticSerial(readLineSerials(row.id), tempId));
        return;
      }

      if (data.line_state && typeof data.line_state.id === 'number') {
        setSerialInput('');
        const confirmed = confirmOptimisticSerial(
          readLineSerials(row.id),
          tempId,
          data.serial_unit,
        );
        publish(data.line_state.id, confirmed);
        // Return scan: the server resolved + persisted the originating order and
        // returns the exact row patch (type→RETURN / listing / carton source /
        // order# / status). Apply it optimistically so the workspace flips to
        // RETURN instantly — this is what makes the type/label flip RELIABLE
        // without the heavy refreshLineWithSerials refetch the scan path used to
        // fire (one of the app's most expensive queries). Null on a normal scan.
        if (data.line_patch) {
          const linePatch = data.line_patch as Partial<ReceivingLineRow> & { id: number };
          // Workspace/accordion only — Unboxed does not subscribe to this bus.
          dispatchUnboxRailLineUpdated(linePatch);
          // Title-only dock rename when return linkage supplies PO# / name fields.
          const rid = row.receiving_id;
          if (rid != null && Number.isFinite(rid)) {
            const titlePatch: {
              item_name?: string | null;
              sku?: string | null;
              zoho_purchaseorder_number?: string | null;
            } = {};
            if ('item_name' in linePatch) titlePatch.item_name = linePatch.item_name ?? null;
            if ('sku' in linePatch) titlePatch.sku = linePatch.sku ?? null;
            if ('zoho_purchaseorder_number' in linePatch) {
              titlePatch.zoho_purchaseorder_number = linePatch.zoho_purchaseorder_number ?? null;
            }
            if (Object.keys(titlePatch).length > 0) {
              patchUnboxRailTitleByCarton(queryClient, rid, titlePatch);
            }
          }
        }
        // Light up the return match band straight from the scan response — works
        // on ANY line (not just a pre-typed RETURN) and needs no extra round-trip,
        // since the server resolves + persists the originating order on the scan.
        if (data.is_return) {
          const su = data.serial_unit;
          serialLookup.applyResult({
            serial,
            found: true,
            is_return: true,
            unit: su
              ? {
                  serial_number: String(su.serial_number ?? serial),
                  sku: su.sku ?? null,
                  current_status: String(su.current_status ?? 'RETURNED'),
                  condition_grade: su.condition_grade ?? null,
                  current_location: su.current_location ?? null,
                  updated_at: su.updated_at ?? null,
                  is_return: true,
                }
              : null,
            matchedOrder: data.matched_order ?? null,
          });
        } else if (receivingType === 'RETURN') {
          // Return context, but this serial didn't resolve to a shipped order —
          // surface "not found in the system" rather than silently attaching it.
          serialLookup.applyResult({ serial, found: false });
        }
        window.dispatchEvent(new CustomEvent('receiving-serial-scanned', {
          detail: {
            line_id: row.id,
            serial_unit: data.serial_unit,
            is_return: !!data.is_return,
          },
        }));
        setTimeout(() => serialInputRef.current?.focus(), 40);
        // No post-scan refetch: the optimistic serials merge above + the return
        // line_patch carry everything the workspace needs. The mount-time
        // reconcile (and delete/replace/grade) still pull fresh serials; the hot
        // scan path stays a single round-trip.
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error scanning serial');
      publish(row.id, rollbackOptimisticSerial(readLineSerials(row.id), tempId));
    } finally {
      submittingRef.current = false;
      setSerialSubmitting(false);
    }
  }, [
    serialInput,
    row.receiving_id,
    row.id,
    staffId,
    receivingType,
    serialLookup,
    setSerialInput,
    serialInputRef,
    readLineSerials,
    publish,
  ]);

  // Keep a live ref to the latest submitSerial so the queue drainer always
  // calls the current closure (fresh row.serials etc.) rather than a stale one.
  const submitSerialRef = useRef(submitSerial);
  submitSerialRef.current = submitSerial;

  // Serial scan queue. enqueueSerial() returns instantly so the multi-qty scan
  // UI can advance focus to the next unit's input without waiting on the
  // network — the operator scans a whole lot in one fast pass. The drainer
  // processes the queue one at a time because /api/receiving/scan-serial takes
  // a row-level FOR UPDATE lock; concurrent writes used to over-receive (2/1).
  const serialQueueRef = useRef<
    Array<{ raw: string; grade: string | null; resolve: () => void }>
  >([]);
  const drainingRef = useRef(false);
  const drainSerialQueue = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      while (serialQueueRef.current.length > 0) {
        const next = serialQueueRef.current.shift();
        if (!next) break;
        await submitSerialRef.current(next.raw, next.grade);
        next.resolve();
      }
    } finally {
      drainingRef.current = false;
      if (serialQueueRef.current.length > 0) {
        void drainSerialQueue();
      }
    }
  }, []);
  const enqueueSerial = useCallback(
    (raw?: string, grade?: string | null): Promise<void> => {
      const v = (raw ?? '').trim();
      if (!v) return Promise.resolve();
      return new Promise<void>((resolve) => {
        serialQueueRef.current.push({ raw: v, grade: grade ?? null, resolve });
        void drainSerialQueue();
      });
    },
    [drainSerialQueue],
  );

  // Remove a single serial_unit from the line (X / Delete on a chip or unit
  // row). Shared by the single-block adder and the multi-qty unit rows.
  const deleteSerialUnit = useCallback(
    async (serialUnitId: number, lineId: number = row.id) => {
      if (serialUnitId == null) return;
      const current = readLineSerials(lineId);
      publish(lineId, markSerialRemoving(current, serialUnitId));

      const res = await fetch('/api/receiving/scan-serial', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial_unit_id: serialUnitId,
          receiving_line_id: lineId,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Could not remove serial');
        publish(lineId, clearSerialRemoving(readLineSerials(lineId), serialUnitId));
        return;
      }
      toast.success('Serial removed');
      publish(lineId, removeSerialById(readLineSerials(lineId), serialUnitId));
    },
    [row.id, readLineSerials, publish],
  );

  // Replace a serial in place (typo fix): delete then re-scan, preserving the
  // unit's condition grade so the corrected serial keeps its grade. The delete
  // leg is marked optimistically (parity with deleteSerialUnit) so the old chip
  // greys out immediately instead of sitting fully-rendered through the DELETE
  // round-trip, then swapping — the stale-then-swap gap the audit flagged.
  const replaceSerialUnit = useCallback(
    async (original: { id: number; serial_number: string; condition_grade?: string | null }, nextSerial: string) => {
      if (original.id == null) return;
      const next = (nextSerial ?? '').trim();
      if (!next || next === original.serial_number) return;
      publish(row.id, markSerialRemoving(readLineSerials(row.id), original.id));
      const res = await fetch('/api/receiving/scan-serial', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial_unit_id: original.id,
          receiving_line_id: row.id,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Could not replace serial');
        publish(row.id, clearSerialRemoving(readLineSerials(row.id), original.id));
        return;
      }
      // Drop the removed serial from the cache, then let submitSerial append the
      // corrected one through its own optimistic path.
      publish(row.id, removeSerialById(readLineSerials(row.id), original.id));
      await submitSerial(next, original.condition_grade ?? null);
    },
    [row.id, submitSerial, readLineSerials, publish],
  );

  // Persist a per-unit condition grade on an already-scanned serial_unit via
  // the dedicated grade endpoint (writes serial_units.condition_grade +
  // GRADED audit). 409 means "no change" — silently ignored.
  const setUnitGrade = useCallback(
    async (serialUnitId: number, grade: string) => {
      // Optimistic: stamp the new grade onto the chip in the siblings cache
      // immediately (mirrors add/delete), so the graded chip updates within a
      // frame instead of waiting on a full per-line refetch. Roll back on error.
      const prev = readLineSerials(row.id);
      publish(row.id, setSerialGrade(prev, serialUnitId, grade));
      try {
        const res = await fetch(`/api/serial-units/${serialUnitId}/grade`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_grade: grade }),
        });
        // 409 = "no change" — the optimistic value already equals the server's.
        if (res.status === 409) return;
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          toast.error(data?.error || 'Could not set unit condition');
          publish(row.id, prev);
          return;
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Condition save failed');
        publish(row.id, prev);
      }
    },
    [row.id, readLineSerials, publish],
  );

  return {
    serialSubmitting,
    refreshLineWithSerials,
    submitSerial,
    enqueueSerial,
    deleteSerialUnit,
    replaceSerialUnit,
    setUnitGrade,
  };
}
