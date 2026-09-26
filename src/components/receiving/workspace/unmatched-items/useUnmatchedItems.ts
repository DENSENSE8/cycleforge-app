'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { returnOrderImportedCopy } from '@/lib/receiving/return-order-imported';
import type { AssignedBox } from '@/components/receiving/workspace/CartonAddPopover';
import {
  inferPlatformFromOrderId,
  type CartonResponse,
  type UnfoundLine,
  type UnmatchedItemsSectionProps,
} from './unmatched-items-shared';
import { requestConfirm } from '@/design-system/components/confirm';
import { getLast8Serial } from '@/lib/copy-chip-format';
import {
  classificationToColumns,
  columnsToClassification,
  type IntakeClassification,
} from '@/lib/receiving/intake-classification';
import {
  buildOptimisticReturnLine,
  mergeUnfoundLinesWithPreserve,
  mintOptimisticLineId,
  remapOptimisticLineId,
  rollbackOptimisticReturnLine,
} from '@/lib/receiving/optimistic-return-line';
import {
  confirmOptimisticSerial,
  mintOptimisticSerialId,
} from '@/lib/receiving/optimistic-serials';
import {
  patchUnboxRailTitleByCarton,
  publishLineSerials,
  reconcileUnboxRailAfterLineDelete,
  remapReceivingSiblingLineId,
  removeReceivingSiblingLine,
  writeReceivingSiblingLine,
} from '@/lib/queries/receiving-queries';
import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { dispatchUnboxRailLineUpdated } from '@/components/sidebar/receiving/unbox-rail-events';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { refreshDomains } from '@/lib/refresh/bus';
import { REFRESH_BUNDLES } from '@/lib/refresh/domains';
import { addUnmatchedLine } from '@/lib/receiving/add-unmatched-line-client';

/** Owns an unmatched (no-Zoho-PO) carton's items section: */
export function useUnmatchedItems({
  receivingId,
  staffId,
  sourcePlatformHint,
  receivingTypeHint = 'PO',
  listingUrlHint,
  onActiveConditionChange,
  onLinked,
}: UnmatchedItemsSectionProps) {
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<UnfoundLine[]>([]);
  /** Unified add popover (Item · Web · Box). */
  const [addOpen, setAddOpen] = useState(false);
  /** Box this carton's units last landed in — shows as a chip in the header. */
  const [assignedBox, setAssignedBox] = useState<AssignedBox | null>(null);

  // Carton-level serial matcher.
  const [returnScanBusy, setReturnScanBusy] = useState(false);
  // Ref so refreshLines can skip destructive clears without re-subscribing the
  // mount effect every time a return scan starts/finishes.
  const returnScanBusyRef = useRef(false);
  useEffect(() => {
    returnScanBusyRef.current = returnScanBusy;
  }, [returnScanBusy]);
  // Condition for the carton-level serial scan, shown via the same ConditionPills
  // a regular unbox serial card uses. Applied to the line the scan creates.
  const [cartonScanCondition, setCartonScanCondition] = useState('USED_A');

  // Door classification ("Receiving as") for this carton — desktop parity with
  // the mobile /m/receive selector. Seeds from the carton's stored intake
  // columns; saving maps the pick back onto those columns via the SoT.
  const [classification, setClassification] = useState<IntakeClassification>('UNKNOWN');

  const refreshLines = useCallback(async () => {
    // Guard: never hit the API for a non-materialized carton (optimistic open
    // stub id, or no selection). A bad id only ever 404s "Package not found".
    if (!Number.isFinite(receivingId) || receivingId <= 0) {
      setLines([]);
      return;
    }
    try {
      const res = await fetch(`/api/receiving/${receivingId}`, {
        cache: 'no-store',
      });
      const body = (await res.json().catch(() => null)) as CartonResponse | null;
      if (!res.ok || !body?.success) {
        // Carton not visible yet — an optimistic/just-promoted open, a mid-create race, or a stale unfound-queue stub.
        setLines((prev) =>
          returnScanBusyRef.current || prev.length > 0 ? prev : [],
        );
        return;
      }
      // Merge + preserve:
      setLines((prev) => mergeUnfoundLinesWithPreserve(prev, body.lines ?? []));
      if (body.receiving) {
        // intake_type maps onto the SoT's `receiving_type` slot.
        setClassification(
          columnsToClassification({
            is_return: body.receiving.is_return,
            return_platform: body.receiving.return_platform,
            source_platform: body.receiving.source_platform,
            receiving_type: body.receiving.intake_type,
          }),
        );
      }
    } catch {
      // Network/parse failure on a background auto-load — no toast. Keep any
      // local optimistic / already-loaded lines; only clear when truly empty.
      setLines((prev) =>
        returnScanBusyRef.current || prev.length > 0 ? prev : [],
      );
    }
  }, [receivingId]);

  // Persist a door-classification pick:
  const saveClassification = useCallback(
    async (next: IntakeClassification) => {
      setClassification(next);
      const cols = classificationToColumns(next);
      const intakeType =
        cols.receiving_type && cols.receiving_type !== 'PICKUP' ? cols.receiving_type : null;
      const payload: Record<string, unknown> = {
        is_return: cols.is_return,
        return_platform: cols.return_platform,
        source_platform: cols.source_platform,
        ...(intakeType ? { intake_type: intakeType } : {}),
      };
      try {
        const res = await fetch(`/api/receiving/${receivingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          toast.error(b?.error ?? `Could not set the receiving type (${res.status})`);
          return;
        }
        refreshDomains(REFRESH_BUNDLES.receivingWrite);
        window.dispatchEvent(
          new CustomEvent('receiving-package-updated', {
            detail: { receiving_id: receivingId, ...payload },
          }),
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not set the receiving type');
      }
    },
    [receivingId],
  );

  // Load the carton's lines on mount and whenever the carton changes (`refreshLines` is keyed on `receivingId`).
  useEffect(() => {
    setLines([]);
    void refreshLines();
  }, [refreshLines]);

  // Keep local `lines.serials` in sync with the siblings-cache bus so
  // cartonUnitIds / header counts match ActiveLineConditionSerial after
  // optimistic scan / delete (without a full carton refetch).
  useEffect(() => {
    const handler = (event: Event) => {
      const patch = (event as CustomEvent<{ id?: number; serials?: UnfoundLine['serials'] }>).detail;
      if (!patch || typeof patch.id !== 'number' || patch.serials === undefined) return;
      setLines((prev) =>
        prev.map((l) => (l.id === patch.id ? { ...l, serials: patch.serials } : l)),
      );
    };
    window.addEventListener('receiving-line-updated', handler);
    return () => window.removeEventListener('receiving-line-updated', handler);
  }, []);

  // Serial-unit ids across the carton's lines — the atoms the Box tab groups.
  const cartonUnitIds = useMemo(
    () => lines.flatMap((l) => (l.serials ?? []).map((s) => s.id)),
    [lines],
  );

  // Scan a returned serial against the whole carton.
  const handleReturnSerialScan = useCallback(
    async (rawSerial: string) => {
      const serial = rawSerial.trim();
      if (!serial || returnScanBusy) return;
      setReturnScanBusy(true);

      const tempLineId = mintOptimisticLineId();
      const tempSerialId = mintOptimisticSerialId();
      const optimisticLine = buildOptimisticReturnLine({
        receivingId,
        serial,
        condition: cartonScanCondition || 'USED_A',
        tempLineId,
        tempSerialId,
      }) as UnfoundLine;

      // Frame-1: flip empty carton → accordion row with optimistic serial chip.
      setLines((prev) => [...prev.filter((l) => l.id !== tempLineId), optimisticLine]);
      writeReceivingSiblingLine(queryClient, receivingId, optimisticLine);
      dispatchLineUpdated({
        id: tempLineId,
        serials: optimisticLine.serials,
      });
      // Unboxed opts out of the shared bus — title-only carton rename (age/qty
      // / status stay put). Accordion still gets the bus patch above.
      if (optimisticLine.item_name) {
        patchUnboxRailTitleByCarton(queryClient, receivingId, {
          item_name: optimisticLine.item_name,
        });
      }
      onActiveConditionChange?.(cartonScanCondition || 'USED_A');

      const clientEventId = `unfound-return-${receivingId}-${serial}`;
      try {
        const addRes = await fetch('/api/receiving/add-unmatched-line', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': clientEventId },
          body: JSON.stringify({
            receiving_id: receivingId,
            item_name: optimisticLine.item_name,
            intake_type: 'return',
            condition_grade: cartonScanCondition || undefined,
            client_event_id: clientEventId,
          }),
        });
        const addBody = await addRes.json().catch(() => ({}));
        if (!addRes.ok || !addBody?.success || !addBody?.line?.id) {
          const msg = addBody?.error || 'Could not create the return line';
          toast.error(msg);
          setLines((prev) => rollbackOptimisticReturnLine(prev, tempLineId));
          removeReceivingSiblingLine(queryClient, receivingId, tempLineId);
          return;
        }

        const lineId = addBody.line.id as number;
        const remappedLine = {
          ...addBody.line,
          serials: optimisticLine.serials,
        } as UnfoundLine;
        setLines((prev) => remapOptimisticLineId(prev, tempLineId, remappedLine));
        remapReceivingSiblingLineId(queryClient, receivingId, tempLineId, remappedLine);
        // Notify listeners that swapped the temp id for the real one.
        dispatchLineUpdated({
          id: lineId,
          serials: optimisticLine.serials,
          item_name: remappedLine.item_name,
          condition_grade: remappedLine.condition_grade,
        });

        const scanRes = await fetch('/api/receiving/scan-serial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiving_id: receivingId,
            receiving_line_id: lineId,
            serial_number: serial,
            staff_id: Number(staffId) || undefined,
            condition_grade: cartonScanCondition || undefined,
            client_event_id: clientEventId,
          }),
        });
        const scanBody = await scanRes.json().catch(() => ({}));
        if (!scanRes.ok || !scanBody?.success) {
          // Partial failure: line exists in DB — keep it, drop optimistic chip,
          // let the operator retry scanning on the line.
          toast.error(scanBody?.error || 'Line created — scan the serial again to attach it');
          publishLineSerials(queryClient, receivingId, lineId, []);
          setLines((prev) =>
            prev.map((l) => (l.id === lineId ? { ...l, serials: [] } : l)),
          );
          await refreshLines();
          return;
        }

        const confirmed = confirmOptimisticSerial(
          optimisticLine.serials,
          tempSerialId,
          scanBody.serial_unit,
        );
        publishLineSerials(queryClient, receivingId, lineId, confirmed);
        setLines((prev) =>
          prev.map((l) => (l.id === lineId ? { ...l, serials: confirmed } : l)),
        );

        // Server return-linkage patch (type→RETURN / order# / platform) — apply
        // optimistically so we skip the redundant carton PATCH hop.
        if (scanBody.line_patch && typeof scanBody.line_patch.id === 'number') {
          dispatchUnboxRailLineUpdated(
            scanBody.line_patch as Partial<ReceivingLineRow> & { id: number },
          );
          writeReceivingSiblingLine(queryClient, receivingId, {
            ...remappedLine,
            ...scanBody.line_patch,
            serials: confirmed,
          });
        }

        const matchedOrder = scanBody.matched_order as
          | { order_id?: string | null; product_title?: string | null; sku?: string | null }
          | null
          | undefined;
        const orderNo = (matchedOrder?.order_id || '').trim();
        const hasOrderMatch = Boolean(orderNo);
        const platform = hasOrderMatch ? inferPlatformFromOrderId(orderNo) : null;

        const lineWithSerials = {
          ...remappedLine,
          ...(scanBody.line_patch ?? {}),
          serials: confirmed,
          item_name:
            matchedOrder?.product_title ||
            remappedLine.item_name ||
            `Return serial ${serial}`,
          sku: matchedOrder?.sku || remappedLine.sku || null,
        } as UnfoundLine;
        setLines((prev) =>
          prev.map((l) => (l.id === lineId ? { ...l, ...lineWithSerials } : l)),
        );
        writeReceivingSiblingLine(queryClient, receivingId, lineWithSerials);

        // Title may upgrade from "Return serial …" → product title on order match.
        if (lineWithSerials.item_name || lineWithSerials.sku) {
          patchUnboxRailTitleByCarton(queryClient, receivingId, {
            item_name: lineWithSerials.item_name ?? null,
            sku: lineWithSerials.sku ?? null,
          });
        }

        const onLinkedLine = {
          id: lineId,
          sku: lineWithSerials.sku,
          item_name: lineWithSerials.item_name,
          quantity_expected: lineWithSerials.quantity_expected,
          quantity_received: Number(lineWithSerials.quantity_received ?? 0),
          condition_grade: lineWithSerials.condition_grade ?? null,
          listing_url: null,
          source_platform_pill: platform,
          serials: confirmed,
        };

        if (!hasOrderMatch) {
          // Non-blocking triage flag (RETURN_NO_ORDER) — scan already attached
          // the serial; log-serial is idempotent enrichment only.
          void fetch('/api/receiving/log-serial', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': `${clientEventId}:log`,
            },
            body: JSON.stringify({
              serial_number: serial,
              receiving_id: receivingId,
              receiving_line_id: lineId,
              client_event_id: `${clientEventId}:log`,
            }),
          }).catch(() => {
            /* non-fatal */
          });
          // Mark carton RETURN when server did not already promote via line_patch.
          if (!scanBody.line_patch) {
            void fetch(`/api/receiving/${receivingId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ intake_type: 'RETURN', is_return: true }),
            }).catch(() => {
              /* non-fatal */
            });
          }
          onLinked?.({
            carton: {
              zoho_purchaseorder_number: null,
              source: 'unmatched',
              source_platform: null,
              intake_type: 'RETURN',
            },
            line: onLinkedLine,
          });
          toast.info(`Serial ${getLast8Serial(serial)} recorded — no sales order match`);
          return;
        }

        window.dispatchEvent(
          new CustomEvent('receiving-package-updated', {
            detail: {
              receiving_id: receivingId,
              ...(platform ? { source_platform: platform } : {}),
              zoho_purchaseorder_number: orderNo,
            },
          }),
        );
        onLinked?.({
          carton: {
            zoho_purchaseorder_number: orderNo,
            source: 'zoho_po',
            source_platform: platform,
            intake_type: 'RETURN',
          },
          line: onLinkedLine,
        });
        const copy = returnOrderImportedCopy({
          orderId: orderNo,
          productTitle: matchedOrder?.product_title,
          sku: matchedOrder?.sku,
          platform: platform,
        });
        toast.success(copy.title, { description: copy.description });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Match failed');
        setLines((prev) => rollbackOptimisticReturnLine(prev, tempLineId));
        removeReceivingSiblingLine(queryClient, receivingId, tempLineId);
      } finally {
        setReturnScanBusy(false);
      }
    },
    [
      cartonScanCondition,
      onActiveConditionChange,
      onLinked,
      queryClient,
      receivingId,
      refreshLines,
      returnScanBusy,
      staffId,
    ],
  );

  const handleAddLine = useCallback(
    async (
      selection: {
        sku_platform_id_row: number | null;
        sku_catalog_id: number | null;
        sku: string;
        item_name: string;
        image_url: string | null;
        is_repair_service?: boolean;
        ecwid_order_id?: string;
        ecwid_product_url?: string | null;
      },
      opts?: { allowOffPo?: boolean },
    ) => {
      const line = await addUnmatchedLine({
        receivingId,
        selection,
        opts,
        listingUrlHint,
        sourcePlatformHint,
        receivingTypeHint,
        // Accordion surface wraps onLinked with writeReceivingSiblingLine — avoid
        // a double write when queryClient is also passed here.
        onLinked,
      });
      if (!line) return;
      setLines((prev) => [
        ...prev,
        {
          id: line.id,
          sku: line.sku,
          item_name: line.item_name,
          quantity_expected: line.quantity_expected,
          quantity_received: line.quantity_received,
          condition_grade: line.condition_grade ?? 'USED_A',
          workflow_status: null,
          listing_reference: null,
          location_code: null,
          image_url: line.image_url ?? selection.image_url,
        },
      ]);
      setAddOpen(false);
    },
    [listingUrlHint, onLinked, receivingId, receivingTypeHint, sourcePlatformHint],
  );

  const handleRemoveLine = useCallback(
    async (lineId: number) => {
      const ok = await requestConfirm({
        description: 'Remove this item from the carton?',
        tone: 'danger',
        confirmLabel: 'Remove',
      });
      if (!ok) return;
      // Optimistic — drop it immediately; restore on failure.
      const prev = lines;
      setLines((xs) => xs.filter((l) => l.id !== lineId));
      try {
        const res = await fetch(
          `/api/receiving-lines?id=${encodeURIComponent(String(lineId))}`,
          { method: 'DELETE' },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.success) {
          setLines(prev);
          toast.error(body.error ?? `Remove failed (${res.status})`);
          return;
        }
        toast.success('Item removed');
        // Keep the Unboxed carton row keyed as `carton:{receivingId}` — retarget the representative line or collapse to an unfound stub in place.
        const remaining = prev.filter((l) => l.id !== lineId);
        if (remaining.length === 0) {
          reconcileUnboxRailAfterLineDelete(queryClient, receivingId, {
            kind: 'stub',
            tracking: '',
          });
        } else {
          reconcileUnboxRailAfterLineDelete(queryClient, receivingId, {
            kind: 'line',
            lineId: remaining[0].id,
          });
        }
        window.dispatchEvent(
          new CustomEvent('receiving-line-deleted', { detail: { id: lineId } }),
        );
        // Re-evaluate carton-level state: if the operator just removed the
        // last line, the carton goes back to "unfound" and the queue may
        // want to re-surface it.
        refreshDomains(REFRESH_BUNDLES.receivingWrite);
      } catch (err) {
        setLines(prev);
        toast.error(err instanceof Error ? err.message : 'Remove failed');
      }
    },
    [lines, queryClient, receivingId],
  );

  const handleConditionChange = useCallback(
    async (lineId: number, conditionGrade: string) => {
      const cleared = !String(conditionGrade || '').trim();
      setLines((prev) =>
        prev.map((l) =>
          l.id === lineId
            ? {
                ...l,
                // UI clear: drop the active pill. DB testing.condition_grade is
                // NOT NULL — reopen only retracts condition_graded_at.
                ...(cleared
                  ? { condition_grade: '' }
                  : { condition_grade: conditionGrade }),
              }
            : l,
        ),
      );
      // Surface the grade so the panel's label preview/print tracks it — the
      // matched-carton flow does this through ActiveLineConditionSerial.
      onActiveConditionChange?.(cleared ? '' : conditionGrade);
      const res = await fetch(`/api/receiving/lines/${lineId}/condition`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          cleared ? { reopen: true } : { condition_grade: conditionGrade },
        ),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        toast.error(body.error ?? 'Update failed');
        await refreshLines();
      }
    },
    [refreshLines, onActiveConditionChange],
  );

  // Lineless carton ("PO ITEMS · 0"):
  const handleCartonConditionChange = useCallback(
    (next: string) => {
      setCartonScanCondition(next);
      onActiveConditionChange?.(next);
      if (!Number.isFinite(receivingId) || receivingId <= 0) return;
      void fetch(`/api/receiving/${receivingId}/acknowledge-unbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {
        /* opportunistic milestone stamp — never block grading */
      });
    },
    [receivingId, onActiveConditionChange],
  );

  return {
    lines,
    addOpen, setAddOpen,
    assignedBox, setAssignedBox,
    returnScanBusy,
    cartonScanCondition, setCartonScanCondition,
    handleCartonConditionChange,
    classification, saveClassification,
    refreshLines,
    cartonUnitIds,
    handleReturnSerialScan,
    handleAddLine,
    handleRemoveLine,
    handleConditionChange,
  };
}

export type UnmatchedItemsController = ReturnType<typeof useUnmatchedItems>;
