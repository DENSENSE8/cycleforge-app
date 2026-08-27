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
 * Hot path: {@link enqueueSerial} publishes an optimistic chip immediately and
 * queues the POST. The scan field stays enabled — operators wedge many serials
 * in one pass. The drainer serializes writes (FOR UPDATE lock). Never gate or
 * disable the input on `serialSubmitting`.
 */

import { useCallback, useRef, useState, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { unwrapScannedSerial } from '@/lib/barcode-routing';
import { toast } from '@/lib/toast';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { dispatchUnboxRailLineUpdated } from '@/components/sidebar/receiving/unbox-rail-events';
import {
  patchUnboxRailTitleByCarton,
  receivingSiblingsQueryKey,
  receivingSiblingsSerialsQueryKey,
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
  unlinkSerialFromLineUnits,
  type LineSerial,
} from '@/lib/receiving/optimistic-serials';
import type { ReceivingLineUnitView } from '@/components/station/receiving-line-row';
import { useScanFeedback } from '@/lib/scan-feedback/useScanFeedback';
import { pulseScanLine } from '@/lib/scan-feedback/visual';
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

type QueuedSerial = {
  raw: string;
  grade: string | null;
  lineId: number | undefined;
  tempId: number;
  resolve: () => void;
};

export function useLineSerials({
  row,
  staffId,
  receivingType,
  serialInput,
  setSerialInput,
  serialLookup,
  // Kept for call-site compat (dock handoff still wires the ref); scan UIs
  // own focus themselves and must not be re-focused after confirm.
  serialInputRef: _serialInputRef,
}: UseLineSerialsArgs) {
  const queryClient = useQueryClient();
  const { playScanFeedback } = useScanFeedback();
  /** Soft hint only — never disable the scan field from this flag. */
  const [serialSubmitting, setSerialSubmitting] = useState(false);

  const serialQueueRef = useRef<QueuedSerial[]>([]);
  const drainingRef = useRef(false);

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

  const readLineUnits = useCallback(
    (lineId: number): ReceivingLineUnitView[] | null => {
      const receivingId = row.receiving_id;
      if (!receivingId) return null;
      const cached = queryClient.getQueryData<{
        success: boolean;
        receiving_lines: ReceivingLineRow[];
      }>(receivingSiblingsQueryKey(receivingId));
      const hit = cached?.receiving_lines?.find((l) => l.id === lineId);
      return (hit?.units as ReceivingLineUnitView[] | null | undefined) ?? null;
    },
    [queryClient, row.receiving_id],
  );

  const publish = useCallback(
    (
      lineId: number,
      serials: LineSerial[],
      units?: ReceivingLineUnitView[] | null,
    ) => {
      publishLineSerials(
        queryClient,
        row.receiving_id,
        lineId,
        serials,
        units,
      );
    },
    [queryClient, row.receiving_id],
  );

  // NO per-line `?id=&include=serials` refetch here (was a mount-effect on active-
  // line change). `usePoLinesData`'s carton-wide `serialsQuery` already hydrates
  // every line's serials/units onto the same `['receiving-siblings']` cache — and
  // its overlay SKIPS in-flight optimistic rows, which a raw refetch did not. So
  // the old per-line fetch was both a redundant fourth round-trip AND the "deleted
  // serial reappears" back-door (a bare `fetch`, so `deleteSerialUnit`'s
  // `cancelQueries` guard could not stop it from resolving late over the removal).

  const submitSerial = useCallback(async (
    raw?: string,
    conditionGrade?: string | null,
    /** Target line — defaults to the controller-active row. Interleaved SKU bodies pass the line under the editor. */
    targetLineId?: number,
    /**
     * When set, the caller already published an optimistic chip (enqueue path).
     * Direct callers omit this and we mint + publish here.
     */
    existingTempId?: number,
  ) => {
    const serial = (raw ?? serialInput).trim();
    if (!serial || !row.receiving_id) return;
    const lineId = targetLineId ?? row.id;
    const tempId = existingTempId ?? mintOptimisticSerialId();
    if (existingTempId == null) {
      publish(lineId, appendOptimisticSerial(readLineSerials(lineId), serial, tempId));
      setSerialInput(serial);
    }

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

      const res = await fetch('/api/receiving/scan-serial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiving_id: row.receiving_id,
          receiving_line_id: lineId,
          serial_number: serial,
          staff_id: Number(staffId),
          // Per-unit grade (multi-qty rows stamp each scan with the grade
          // chosen for that slot). Omitted for the single-block path.
          condition_grade: conditionGrade ?? undefined,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        toast.error(data?.error || `Scan failed (${res.status})`);
        publish(lineId, rollbackOptimisticSerial(readLineSerials(lineId), tempId));
        playScanFeedback('reject');
        return;
      }

      // Same serial already on this line — friendly no-op.
      if (data.already_attached) {
        toast.info(`Already added — ${serial}`);
        publish(lineId, rollbackOptimisticSerial(readLineSerials(lineId), tempId));
        playScanFeedback('reject');
        return;
      }

      if (data.line_state && typeof data.line_state.id === 'number') {
        const confirmed = confirmOptimisticSerial(
          readLineSerials(lineId),
          tempId,
          data.serial_unit,
        );
        publish(data.line_state.id, confirmed);
        playScanFeedback('success');
        pulseScanLine(data.line_state.id);
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
        // Attach may rewrite a stale generated `Return serial …` title to the
        // scanned unit — apply that without waiting on a full line refetch.
        const syncedName =
          typeof data.line_state.item_name === 'string'
            ? data.line_state.item_name.trim()
            : '';
        if (syncedName && !data.line_patch?.item_name) {
          const titlePatch = {
            id: data.line_state.id as number,
            item_name: syncedName,
          };
          dispatchUnboxRailLineUpdated(titlePatch);
          const rid = row.receiving_id;
          if (rid != null && Number.isFinite(rid)) {
            patchUnboxRailTitleByCarton(queryClient, rid, { item_name: syncedName });
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
                  id: typeof su.id === 'number' ? su.id : null,
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
            line_id: lineId,
            serial_unit: data.serial_unit,
            is_return: !!data.is_return,
          },
        }));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Network error scanning serial');
      publish(lineId, rollbackOptimisticSerial(readLineSerials(lineId), tempId));
      playScanFeedback('reject');
    }
  }, [
    serialInput,
    row.receiving_id,
    row.id,
    staffId,
    receivingType,
    serialLookup,
    setSerialInput,
    readLineSerials,
    publish,
    playScanFeedback,
    queryClient,
  ]);

  // Keep a live ref to the latest submitSerial so the queue drainer always
  // calls the current closure rather than a stale one.
  const submitSerialRef = useRef(submitSerial);
  submitSerialRef.current = submitSerial;

  const drainSerialQueue = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    setSerialSubmitting(true);
    try {
      while (serialQueueRef.current.length > 0) {
        const next = serialQueueRef.current.shift();
        if (!next) break;
        await submitSerialRef.current(next.raw, next.grade, next.lineId, next.tempId);
        next.resolve();
      }
    } finally {
      drainingRef.current = false;
      setSerialSubmitting(serialQueueRef.current.length > 0);
      if (serialQueueRef.current.length > 0) {
        void drainSerialQueue();
      }
    }
  }, []);

  /**
   * Instant accept: optimistic chip + label buffer, then queue the POST.
   * Never blocks the scan field — wedge as fast as the hardware allows.
   */
  const enqueueSerial = useCallback(
    (
      raw?: string,
      grade?: string | null,
      targetLineId?: number,
    ): Promise<void> => {
      // A printed unit label carries a GS1 Digital Link / element string /
      // `U-{serial}` — never a bare serial. Decode through the ONE decoder
      // before anything optimistic or persisted reads it.
      const v = unwrapScannedSerial(raw ?? '');
      if (!v || !row.receiving_id) return Promise.resolve();
      const lineId = targetLineId ?? row.id;
      const tempId = mintOptimisticSerialId();
      publish(lineId, appendOptimisticSerial(readLineSerials(lineId), v, tempId));
      setSerialInput(v);
      return new Promise<void>((resolve) => {
        serialQueueRef.current.push({
          raw: v,
          grade: grade ?? null,
          lineId: targetLineId,
          tempId,
          resolve,
        });
        void drainSerialQueue();
      });
    },
    [drainSerialQueue, publish, readLineSerials, row.id, row.receiving_id, setSerialInput],
  );

  // Remove a single serial_unit from the line (X / Delete on a chip or unit
  // row). Shared by the single-block adder and the multi-qty unit rows.
  const deleteSerialUnit = useCallback(
    async (serialUnitId: number, lineId: number = row.id) => {
      if (serialUnitId == null) return;
      // Canonical optimistic-mutation guard (TanStack Query): cancel any in-flight
      // `?include=serials` refetch for this carton FIRST, so a fetch that began
      // pre-delete cannot resolve late and overwrite the optimistic removal — the
      // "deleted serial reappears" race. BOTH keys: the accordion metadata cache
      // AND the parallel serials-hydration query (`usePoLinesData`'s serialsQuery)
      // — either can resurrect the removed serial on a late resolve.
      if (row.receiving_id != null) {
        await Promise.all([
          queryClient.cancelQueries({
            queryKey: receivingSiblingsQueryKey(row.receiving_id),
          }),
          queryClient.cancelQueries({
            queryKey: receivingSiblingsSerialsQueryKey(row.receiving_id),
          }),
        ]);
      }
      const current = readLineSerials(lineId);
      const currentUnits = readLineUnits(lineId);
      const nextUnits =
        currentUnits != null
          ? unlinkSerialFromLineUnits(currentUnits, serialUnitId)
          : undefined;
      // Unlink the unit slot immediately so flush Units rows (and synthesize)
      // cannot keep painting the deleted serial.
      publish(lineId, markSerialRemoving(current, serialUnitId), nextUnits);

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
        publish(
          lineId,
          clearSerialRemoving(readLineSerials(lineId), serialUnitId),
          currentUnits ?? undefined,
        );
        return;
      }
      toast.success('Serial removed');
      publish(
        lineId,
        removeSerialById(readLineSerials(lineId), serialUnitId),
        nextUnits,
      );
    },
    [row.id, row.receiving_id, queryClient, readLineSerials, readLineUnits, publish],
  );

  // Replace a serial in place (typo fix): delete then re-scan via the same
  // optimistic queue as a fresh wedge scan.
  const replaceSerialUnit = useCallback(
    async (
      original: { id: number; serial_number: string; condition_grade?: string | null },
      nextSerial: string,
      targetLineId?: number,
    ) => {
      if (original.id == null) return;
      const next = (nextSerial ?? '').trim();
      if (!next || next === original.serial_number) return;
      const lineId = targetLineId ?? row.id;
      const currentUnits = readLineUnits(lineId);
      const nextUnits =
        currentUnits != null
          ? unlinkSerialFromLineUnits(currentUnits, original.id)
          : undefined;
      publish(
        lineId,
        markSerialRemoving(readLineSerials(lineId), original.id),
        nextUnits,
      );
      const res = await fetch('/api/receiving/scan-serial', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial_unit_id: original.id,
          receiving_line_id: lineId,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Could not replace serial');
        publish(
          lineId,
          clearSerialRemoving(readLineSerials(lineId), original.id),
          currentUnits ?? undefined,
        );
        return;
      }
      publish(
        lineId,
        removeSerialById(readLineSerials(lineId), original.id),
        nextUnits,
      );
      await enqueueSerial(next, original.condition_grade ?? null, lineId);
    },
    [row.id, enqueueSerial, readLineSerials, readLineUnits, publish],
  );

  // Persist a per-unit condition grade on an already-scanned serial_unit via
  // the dedicated grade endpoint (writes serial_units.condition_grade +
  // GRADED audit). Empty grade clears. 409 means "no change" — silently ignored.
  const setUnitGrade = useCallback(
    async (serialUnitId: number, grade: string, targetLineId?: number) => {
      // Optimistic serials mint negative ids; the grade route 400s on ≤0.
      if (!(serialUnitId > 0)) return;
      const lineId = targetLineId ?? row.id;
      // Optimistic: stamp (or clear) the grade onto the chip in the siblings
      // cache immediately. Roll back on error.
      const prev = readLineSerials(lineId);
      const nextGrade = String(grade || '').trim() ? grade : null;
      publish(lineId, setSerialGrade(prev, serialUnitId, nextGrade));
      try {
        const res = await fetch(`/api/serial-units/${serialUnitId}/grade`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_grade: nextGrade }),
        });
        // 409 = "no change" — the optimistic value already equals the server's.
        if (res.status === 409) return;
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          toast.error(data?.error || 'Could not set unit condition');
          publish(lineId, prev);
          return;
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Condition save failed');
        publish(lineId, prev);
      }
    },
    [row.id, readLineSerials, publish],
  );

  return {
    serialSubmitting,
    submitSerial,
    enqueueSerial,
    deleteSerialUnit,
    replaceSerialUnit,
    setUnitGrade,
  };
}
