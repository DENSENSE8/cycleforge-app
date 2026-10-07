'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { unwrapScannedSerial } from '@/lib/barcode-routing';
import { toast } from '@/lib/toast';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { generateInternalGtin } from '@/lib/inventory/internal-gtin-format';
import { useAuth } from '@/contexts/AuthContext';
import {
  unitStatusToVerdict,
  verdictToUnitStatus,
  type TestingVerdict,
} from '@/components/receiving/workspace/TestingStatusPills';
import { type UnitSlotSerial } from '@/components/tech/TestingUnitSlots';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import { takeSerialEditHandoff } from '@/components/receiving/workspace/serialEditHandoff';
import {
  buildUnitPayload,
  preloadProductLabelPrint,
  printProductLabel,
  resolveTestingLineTitle,
} from '@/lib/print/printProductLabel';
import { useReceivingLineCore } from '@/components/receiving/workspace/line-edit/hooks/useReceivingLineCore';
import { useCartonLabelEditor } from '@/components/receiving/workspace/line-edit/hooks/useCartonLabelEditor';
import type { LabelEditDraft } from '@/components/receiving/workspace/line-edit/LabelEditPopover';
import {
  dispatchTestingLineUpdated,
  narrowTestingWorkspacePatch,
} from '@/components/tech/testing-line-events';
import { patchTestingRailByLine } from '@/lib/queries/receiving-queries';
import { shouldUseLocalReceiveOnly } from '@/lib/receiving/intake-items-routing';
import { refreshDomain } from '@/lib/refresh/bus';
import {
  TESTING_LABEL_KINDS,
  labelOptionsForSelect,
  listAvailableLabelOptions,
  resolveActiveLabelKind,
  workspaceLabelToFace,
  type WorkspaceLabelContext,
} from '@/lib/print/workspace-label-kinds';

/** `POST /api/qc/units/:id/print-pass` — 202 once the outbox row is queued. */
interface PrintPassResponse {
  ok: boolean;
  outbox_id?: number;
  /** The id the label wears — minted by the route when the unit had none. */
  unit_uid?: string | null;
  error?: string;
}

/** First re-read after a print-pass 202; each re-read that still finds the Pass unsaved doubles the wait. */
const PRINT_PASS_RECONCILE_MS = 2000;
/** Re-reads before the line takes the server's word over a still-unsaved Pass (2 + 4 + 8 + 16 s). */
const PRINT_PASS_RECONCILE_TRIES = 4;

type TestingLabelDraft = {
  title: string;
  color: string;
  condition: string;
};

/** Controller for the TESTING workspace display. */
export function useTestingLineController(
  row: ReceivingLineRow,
  staffId: string,
  opts?: {
    labelColor?: string;
    /**
     * Prefer Displays Ticket leaf over a blocking claim modal (Unbox grain).
     * When set, {@link openClaimModal} opens that surface instead of `claimOpen`.
     */
    onOpenClaim?: (mode: 'create' | 'link') => void;
  },
) {
  const labelColor = opts?.labelColor ?? '';
  const onOpenClaim = opts?.onOpenClaim;
  const core = useReceivingLineCore(row, staffId, { dispatchLine: dispatchTestingLineUpdated });
  const queryClient = useQueryClient();
  // Tenant slug for platform Digital Link minting. Testing is the one unit-label
  // caller that carries a real GTIN, so it is the one whose matrix changes from
  // a GS1 element string to an absolute `{slug}.app…/01/…` URL.
  const { user } = useAuth();
  const orgSlug = user?.organizationSlug ?? null;
  // Editable carton label (default draft + preview payload + Save & print), driving the label preview's pencil → editor CTA — same face as…
  const cartonLabel = useCartonLabelEditor(row, core, {
    conditionCode: row.condition_grade || 'USED_A',
    notes: (row.label_note || '').trim(),
  });

  const [serialSubmitting, setSerialSubmitting] = useState(false);
  const serialSubmittingRef = useRef(false);
  /** Dock draft — same grain as Unbox `itemNote` (`receiving_line.notes`). */
  const [itemNote, setItemNote] = useState<string>('');
  // Back-compat aliases — callers that still say `notes` / `setNotes`.
  const notes = itemNote;
  const setNotes = setItemNote;
  const [claimOpen, setClaimOpen] = useState(false);
  const [claimInitialMode, setClaimInitialMode] = useState<'create' | 'link'>('create');
  const openClaimModal = useCallback(
    (mode: 'create' | 'link' = 'create') => {
      // Station focused panel: Ticket Displays hosts create/link — never cover
      // the middle triage surface with ReceivingClaimModal.
      if (onOpenClaim) {
        onOpenClaim(mode);
        return;
      }
      setClaimInitialMode(mode);
      setClaimOpen(true);
    },
    [onOpenClaim],
  );
  const [activeSlotByLine, setActiveSlotByLine] = useState<Record<number, number>>({});
  const [headerSerialEdit, setHeaderSerialEdit] = useState<UnitSlotSerial | null>(null);
  // The line as of the last paint. Presses read and paint through it, so a
  // second press before the re-render composes with the first, and the advance
  // reads the status just painted. A new `row` from the parent replaces it.
  const rowRef = useRef(row);
  const seenRowRef = useRef(row);
  if (seenRowRef.current !== row) {
    seenRowRef.current = row;
    rowRef.current = row;
  }

  const lineTitle = useMemo(() => resolveTestingLineTitle(row), [row]);
  // The unit label's GTIN from the line alone: the catalog's, else the internal
  // one `getOrCreateInternalGtin` persists for this catalog row.
  const labelGtin = useMemo(() => {
    const catalogGtin = row.catalog_gtin?.trim();
    if (catalogGtin) return catalogGtin;
    const catalogId = Number(row.sku_catalog_id);
    return Number.isInteger(catalogId) && catalogId > 0 ? generateInternalGtin(catalogId) : null;
  }, [row.catalog_gtin, row.sku_catalog_id]);

  // Bootstrap notes each time the line changes.
  useEffect(() => {
    setItemNote(row.notes ?? '');
  }, [row.id, row.notes]);

  // Refresh the line's serials when it changes — table-side caches are slower.
  const refreshLineWithSerials = useCallback(async (id: number) => {
    if (!Number.isFinite(id) || id <= 0) return;
    try {
      const res = await fetch(`/api/receiving-lines?id=${id}&include=serials`);
      const data = await res.json();
      if (data?.success && data.receiving_line) {
        dispatchTestingLineUpdated(
          narrowTestingWorkspacePatch(data.receiving_line as ReceivingLineRow),
        );
      }
    } catch {
      /* silent — next manual action will retry */
    }
  }, []);

  useEffect(() => {
    if (row.id > 0) void refreshLineWithSerials(row.id);
  }, [row.id, refreshLineWithSerials]);

  // The first Pass must not wait on the print chunk.
  useEffect(() => {
    void preloadProductLabelPrint();
  }, []);

  // Write a unit's new current_status into the accordion's siblings query cache
  // — the same store the verdict pills render from — so the highlight holds.
  const patchSiblingUnitStatus = useCallback(
    (receivingId: number, lineId: number, serialId: number, status: string | undefined) => {
      queryClient.setQueryData(
        ['receiving-siblings', receivingId],
        (prev: { success?: boolean; receiving_lines?: ReceivingLineRow[] } | undefined) => {
          if (!prev?.receiving_lines) return prev;
          return {
            ...prev,
            receiving_lines: prev.receiving_lines.map((ln) =>
              ln.id === lineId
                ? {
                    ...ln,
                    serials: (ln.serials ?? []).map((s) =>
                      s.id === serialId ? { ...s, current_status: status } : s,
                    ),
                  }
                : ln,
            ),
          };
        },
      );
    },
    [queryClient],
  );

  /**
   * Paint one unit's fields into both stores the pills read from: the open
   * line (through {@link rowRef}) and the accordion's siblings cache.
   */
  const paintSerial = useCallback(
    (
      lineId: number,
      serialId: number,
      patch: { current_status?: string; unit_uid?: string | null },
    ) => {
      const current = rowRef.current;
      if (lineId === current.id) {
        const serials = (current.serials ?? []).map((s) =>
          s.id === serialId ? { ...s, ...patch } : s,
        );
        rowRef.current = { ...current, serials };
        dispatchTestingLineUpdated({ id: lineId, serials });
      }
      if ('current_status' in patch && typeof current.receiving_id === 'number') {
        patchSiblingUnitStatus(current.receiving_id, lineId, serialId, patch.current_status);
      }
    },
    [patchSiblingUnitStatus],
  );

  // Keep a pressed unit active: the default slot follows "first unit with no
  // verdict", which would jump away the moment its verdict paints.
  const pinSlot = useCallback((lineId: number, serialId: number) => {
    if (lineId !== rowRef.current.id) return;
    const index = (rowRef.current.serials ?? []).findIndex((s) => s.id === serialId);
    if (index >= 0) setActiveSlotByLine((m) => (m[lineId] === index ? m : { ...m, [lineId]: index }));
  }, []);

  /** The rail's tested count, from the open line's painted units — no round trip. */
  const patchRailTestedCount = useCallback(
    (lineId: number) => {
      if (lineId !== rowRef.current.id) return;
      const tested = (rowRef.current.serials ?? []).filter(
        (s) => unitStatusToVerdict(s.current_status) === 'PASS',
      ).length;
      patchTestingRailByLine(queryClient, lineId, { tested_count: tested });
    },
    [queryClient],
  );

  /**
   * Delayed re-read after a print-pass request settles: the rail
   * (`testing.lines` refresh domain) and the line pick up what the outbox job
   * committed. A later press on the same line restarts the wait, so a run of
   * presses re-reads once, after the last. While a passed unit still reads
   * un-passed on the server (its job has not committed yet) the re-read keeps
   * the paint and waits again, doubling, up to {@link PRINT_PASS_RECONCILE_TRIES}
   * reads; the last read wins either way, so a job that failed shows.
   */
  const reconcileTimersRef = useRef(new Map<number, number>());
  const awaitingPassRef = useRef(new Map<number, Set<number>>());
  const scheduleReconcile = useCallback((lineId: number, passedSerialId?: number) => {
    const awaiting = awaitingPassRef.current.get(lineId) ?? new Set<number>();
    if (passedSerialId != null) awaiting.add(passedSerialId);
    awaitingPassRef.current.set(lineId, awaiting);
    const timers = reconcileTimersRef.current;
    const run = (attempt: number, delay: number) => {
      window.clearTimeout(timers.get(lineId));
      timers.set(
        lineId,
        window.setTimeout(async () => {
          timers.delete(lineId);
          let line: ReceivingLineRow | null = null;
          try {
            const res = await fetch(`/api/receiving-lines?id=${lineId}&include=serials`);
            const data = await res.json();
            if (data?.success && data.receiving_line) line = data.receiving_line as ReceivingLineRow;
          } catch {
            /* the next press or line open re-reads */
          }
          if (!line) return;
          const passed = verdictToUnitStatus('PASS');
          const pending = (line.serials ?? []).some(
            (s) => awaiting.has(s.id) && s.current_status !== passed,
          );
          if (pending && attempt < PRINT_PASS_RECONCILE_TRIES) {
            run(attempt + 1, delay * 2);
            return;
          }
          awaitingPassRef.current.delete(lineId);
          refreshDomain('testing.lines');
          dispatchTestingLineUpdated(narrowTestingWorkspacePatch(line));
        }, delay),
      );
    };
    run(1, PRINT_PASS_RECONCILE_MS);
  }, []);

  /**
   * A fail press waiting on its fault — one unit pill, or a whole line's units.
   * Null whenever the sheet is closed.
   */
  const [pendingFail, setPendingFail] = useState<{
    lineId: number;
    serials: UnitSlotSerial[];
    label: string;
  } | null>(null);

  // ── Per-unit verdict (optimistic) ───────────────────────────────────────── Reflect the verdict IMMEDIATELY so the pill highlights and…
  const handleSlotVerdict = useCallback(
    async (
      lineId: number,
      serial: UnitSlotSerial,
      next: TestingVerdict,
      /** The fault being claimed. */
      failureModeId: number | null,
    ): Promise<boolean> => {
      const priorStatus = serial.current_status;

      paintSerial(lineId, serial.id, { current_status: verdictToUnitStatus(next) });
      pinSlot(lineId, serial.id);
      refreshDomain('testing.lines');
      if (next === 'TESTING_FAILED' && lineId === row.id) openClaimModal('create');

      try {
        const res = await fetch(`/api/serial-units/${serial.id}/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            verdict: next,
            notes: notes.trim() || null,
            // One id per press: a fixed `{unit}-{verdict}` id replayed the first
            // press on every later one (Pass → Test again → Pass never stuck).
            client_event_id: `testing-verdict-${serial.id}-${next}-${safeRandomUUID()}`,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          toast.error(data?.error || `Verdict save failed (${res.status})`);
          paintSerial(lineId, serial.id, { current_status: priorStatus }); // roll back the optimistic verdict
          if (next === 'TESTING_FAILED' && lineId === row.id) setClaimOpen(false);
          return false;
        }

        // Name the fault on the unit.
        if (next === 'TESTING_FAILED' && failureModeId != null) {
          try {
            await fetch(`/api/serial-units/${serial.id}/failure-tags`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                failureModeId,
                source: 'qc',
                notes: notes.trim() || null,
              }),
            });
          } catch (tagErr) {
            console.warn('[testing] failure tag failed (non-fatal)', tagErr);
          }
        }

        // The server's unit status already equals the painted verdict, so leave
        // it (re-dispatching could clobber a newer press); only reconcile the
        // derived line-level state the server computes across all units.
        if (data.line) {
          const linePatch = {
            id: lineId,
            workflow_status: data.line.workflow_status,
            qa_status: data.line.qa_status,
            disposition_code: data.line.disposition_code,
          };
          dispatchTestingLineUpdated(linePatch);
          // Testing dock is opted off the bus — allowlisted RQ write for instant
          // status/qty chrome; membership still refreshes on the `testing.lines` domain.
          patchTestingRailByLine(queryClient, lineId, {
            workflow_status: data.line.workflow_status,
            qa_status: data.line.qa_status,
            disposition_code: data.line.disposition_code,
            tested_count:
              typeof data.line.tested_count === 'number' ? data.line.tested_count : undefined,
          });
        }
        return true;
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Verdict request failed');
        paintSerial(lineId, serial.id, { current_status: priorStatus }); // roll back the optimistic verdict
        if (next === 'TESTING_FAILED' && lineId === row.id) setClaimOpen(false);
        return false;
      }
    },
    [row.id, notes, paintSerial, pinSlot, openClaimModal, queryClient],
  );

  const handleSlotCondition = useCallback(
    async (lineId: number, serial: UnitSlotSerial, nextGrade: string) => {
      if (serial.id == null) return;
      const priorGrade = serial.condition_grade;

      const applyGrade = (grade: string | null | undefined) => {
        if (lineId === row.id) {
          const nextSerials = (row.serials ?? []).map((s) =>
            s.id === serial.id ? { ...s, condition_grade: grade } : s,
          );
          dispatchTestingLineUpdated({ id: lineId, serials: nextSerials });
        }
      };

      applyGrade(nextGrade);
      try {
        const res = await fetch(`/api/serial-units/${serial.id}/grade`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            new_grade: nextGrade,
            client_event_id: `testing-grade-${serial.id}-${nextGrade}-${Date.now()}`,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) {
          toast.error(data?.error || `Condition update failed (${res.status})`);
          applyGrade(priorGrade);
          return;
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Condition request failed');
        applyGrade(priorGrade);
      }
    },
    [row.id, row.serials],
  );

  const deriveLineVerdict = useCallback(
    (serials: ReadonlyArray<UnitSlotSerial>): TestingVerdict | null => {
      const verdicts = serials.map((s) => unitStatusToVerdict(s.current_status));
      if (verdicts.length === 0) return null;
      if (verdicts.some((v) => v === 'TESTING_FAILED')) return 'TESTING_FAILED';
      if (verdicts.some((v) => v === 'TEST_AGAIN')) return 'TEST_AGAIN';
      if (verdicts.every((v) => v === 'PASS')) return 'PASS';
      return null;
    },
    [],
  );

  const applyLineVerdict = useCallback(
    async (
      lineId: number,
      serials: ReadonlyArray<UnitSlotSerial>,
      next: TestingVerdict,
      /** Same contract as {@link handleSlotVerdict} — required, never defaulted. */
      failureModeId: number | null,
    ) => {
      const targets = serials.filter((s) => s.id != null);
      if (targets.length === 0) {
        toast.info('Scan a serial first, then set a verdict.');
        return;
      }
      for (const s of targets) {
        await handleSlotVerdict(lineId, s, next, failureModeId);
      }
      await refreshLineWithSerials(lineId);
    },
    [handleSlotVerdict, refreshLineWithSerials],
  );

  const confirmPendingFail = useCallback(
    (failureModeId: number) => {
      const pending = pendingFail;
      if (!pending) return;
      setPendingFail(null);
      void applyLineVerdict(pending.lineId, pending.serials, 'TESTING_FAILED', failureModeId);
    },
    [pendingFail, applyLineVerdict],
  );

  const cancelPendingFail = useCallback(() => setPendingFail(null), []);


  const submitSerial = useCallback(
    async (lineId: number, raw: string) => {
      // A printed unit label carries a GS1 Digital Link / element string /
      // `U-{serial}` — never a bare serial. Decode through the ONE decoder
      // before anything optimistic or persisted reads it.
      const serial = unwrapScannedSerial(raw ?? '');
      if (!serial || serialSubmittingRef.current) return;
      // A linked carton is NOT required — the scan-serial route attaches by receiving_line_id, so a returned unit on a not-yet-cartoned line can…
      if (!Number.isFinite(lineId) || lineId <= 0) {
        toast.error('Link this line to a PO or carton first to add serials.');
        return;
      }
      serialSubmittingRef.current = true;
      setSerialSubmitting(true);
      try {
        const res = await fetch('/api/receiving/scan-serial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiving_id: row.receiving_id ?? undefined,
            receiving_line_id: lineId,
            serial_number: serial,
            staff_id: Number(staffId),
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          toast.error(data?.error || `Scan failed (${res.status})`);
          return;
        }
        if (data.already_attached) {
          toast.info(`Already added — ${serial}`);
          return;
        }
        if (lineId === row.id) await refreshLineWithSerials(row.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Network error scanning serial');
      } finally {
        serialSubmittingRef.current = false;
        setSerialSubmitting(false);
      }
    },
    [row.receiving_id, row.id, staffId, refreshLineWithSerials],
  );

  const submitSerialRef = useRef(submitSerial);
  submitSerialRef.current = submitSerial;
  const serialQueueRef = useRef<Array<{ lineId: number; raw: string }>>([]);
  const drainingSerialsRef = useRef(false);
  const drainSerialQueue = useCallback(async () => {
    if (drainingSerialsRef.current) return;
    drainingSerialsRef.current = true;
    try {
      while (serialQueueRef.current.length > 0) {
        const next = serialQueueRef.current.shift();
        if (!next) break;
        await submitSerialRef.current(next.lineId, next.raw);
      }
    } finally {
      drainingSerialsRef.current = false;
    }
  }, []);
  const enqueueSerial = useCallback(
    (lineId: number, raw: string) => {
      const v = (raw ?? '').trim();
      if (!v) return;
      serialQueueRef.current.push({ lineId, raw: v });
      void drainSerialQueue();
    },
    [drainSerialQueue],
  );

  const deleteSerial = useCallback(
    async (lineId: number, serialUnitId: number) => {
      try {
        const res = await fetch('/api/receiving/scan-serial', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serial_unit_id: serialUnitId, receiving_line_id: lineId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          toast.error(data?.error || 'Could not remove serial');
          return;
        }
        toast.success('Serial removed');
        await refreshLineWithSerials(lineId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Remove failed');
      }
    },
    [refreshLineWithSerials],
  );

  const replaceSerial = useCallback(
    async (lineId: number, original: UnitSlotSerial, nextSerial: string) => {
      if (original.id == null) return;
      const next = (nextSerial ?? '').trim();
      if (!next || next === original.serial_number) return;
      try {
        const res = await fetch('/api/receiving/scan-serial', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serial_unit_id: original.id, receiving_line_id: lineId }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          toast.error(data?.error || 'Could not replace serial');
          return;
        }
        await submitSerial(lineId, next);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Replace failed');
      }
    },
    [submitSerial],
  );

  const defaultActiveSlot = useCallback((line: ReceivingLineRow): number => {
    const serials = line.serials ?? [];
    const expected = line.quantity_expected ?? serials.length;
    for (let i = 0; i < serials.length; i++) {
      if (unitStatusToVerdict(serials[i].current_status) == null) return i;
    }
    if (serials.length < expected) return serials.length;
    return 0;
  }, []);

  const activeSlot = useMemo(
    () => activeSlotByLine[row.id] ?? defaultActiveSlot(row),
    [row, activeSlotByLine, defaultActiveSlot],
  );

  const activeSerial: UnitSlotSerial | null = useMemo(
    () => ((row.serials ?? [])[activeSlot] as UnitSlotSerial | undefined) ?? null,
    [row, activeSlot],
  );

  /** The id the active unit wears (minted at receiving) — its label prints it as is. */
  const activeUnitUid = (row.serials ?? [])[activeSlot]?.unit_uid?.trim() || null;

  useEffect(() => {
    setHeaderSerialEdit(null);
    const handoff = row.id != null ? takeSerialEditHandoff(row.id) : null;
    if (handoff) setHeaderSerialEdit(handoff as UnitSlotSerial);
  }, [row.id]);

  /**
   * Print one unit's label, then record it with ONE request. A unit that wears
   * its id prints first, in the press's own gesture; the request
   * (`POST /api/qc/units/:id/print-pass`, keepalive, fire and forget) leaves
   * only once the print is dispatched, and the server's outbox job records the
   * print and, when `pass`, the PASS verdict. Only a unit with no id yet waits
   * on that request for the id the route mints, then prints it. A refused or
   * lost request rolls the PASS paint back and says why — a toast, never a
   * modal. Resolves once this press's print is dispatched (false: nothing to
   * print).
   */
  const printAndRecord = useCallback(
    (serial: UnitSlotSerial, pass: boolean, draft?: Partial<TestingLabelDraft>): Promise<boolean> => {
      const current = rowRef.current;
      if (!current.sku) {
        toast.error('Line has no SKU — cannot issue label');
        return Promise.resolve(false);
      }
      const lineId = current.id;
      const live = (current.serials ?? []).find((s) => s.id === serial.id);
      const unitUid = live?.unit_uid?.trim() || null;
      const priorStatus = live?.current_status ?? serial.current_status;
      const title = (draft?.title ?? lineTitle).trim() || lineTitle;
      const condition = draft?.condition ?? (current.condition_grade || 'USED_A');
      const color = (draft?.color ?? labelColor).trim() || undefined;
      const printedToast = pass ? 'Passed · label printed' : 'Label printed';
      const print = (id: string) =>
        printProductLabel({
          sku: id,
          title,
          serialNumber: serial.serial_number,
          gtin: labelGtin ?? undefined,
          orgSlug,
          condition,
          color,
        });

      const printed = unitUid ? print(unitUid) : Promise.resolve();
      if (pass) {
        paintSerial(lineId, serial.id, { current_status: verdictToUnitStatus('PASS') });
        patchRailTestedCount(lineId);
      }

      const { symbology } = buildUnitPayload({
        sku: unitUid ?? current.sku,
        serialNumber: serial.serial_number,
        gtin: labelGtin,
        orgSlug,
      });
      const body = JSON.stringify({
        client_event_id: `testing-print-pass-${serial.id}-${safeRandomUUID()}`,
        pass,
        unit_uid: unitUid,
        serial_number: serial.serial_number,
        product_sku: current.sku,
        sku_catalog_id: current.sku_catalog_id ?? null,
        gtin: labelGtin,
        symbology,
        condition,
        notes: notes.trim() || null,
      });
      if (unitUid) toast.success(printedToast);
      // The request never leads the print; a print that throws still records the press.
      return printed.catch(() => undefined).then(() => {
        void fetch(`/api/qc/units/${serial.id}/print-pass`, {
          method: 'POST',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body,
        })
          .then(async (res) => {
            const data = (await res.json().catch(() => null)) as PrintPassResponse | null;
            if (!res.ok || !data?.ok) {
              throw new Error(data?.error || `Label record failed (${res.status})`);
            }
            if (!unitUid) {
              const minted = data.unit_uid?.trim();
              if (minted) {
                void print(minted);
                paintSerial(lineId, serial.id, { unit_uid: minted });
                toast.success(printedToast);
              } else {
                toast.error('No unit id came back — label not printed');
              }
            }
            scheduleReconcile(lineId, pass ? serial.id : undefined);
          })
          .catch((err: unknown) => {
            toast.error(err instanceof Error ? err.message : 'Label record failed');
            if (pass) {
              paintSerial(lineId, serial.id, { current_status: priorStatus });
              patchRailTestedCount(lineId);
            }
            scheduleReconcile(lineId);
          });
        return true;
      });
    },
    [
      lineTitle,
      labelColor,
      labelGtin,
      orgSlug,
      notes,
      paintSerial,
      patchRailTestedCount,
      scheduleReconcile,
    ],
  );

  const findNextOpenSibling = useCallback(
    async (currentRow: ReceivingLineRow): Promise<ReceivingLineRow | null> => {
      if (currentRow.receiving_id == null) return null;
      try {
        const res = await fetch(
          `/api/receiving-lines?receiving_id=${currentRow.receiving_id}&include=serials`,
        );
        const data = await res.json();
        const siblings: ReceivingLineRow[] = data?.receiving_lines ?? [];
        const open = siblings.filter((s) => {
          if (s.id === currentRow.id) return false;
          const v = String(s.workflow_status || '').toUpperCase();
          return v !== 'DONE' && v !== 'PASSED';
        });
        return open[0] ?? null;
      } catch {
        return null;
      }
    },
    [],
  );

  /**
   * After a Pass, move to the next unit still waiting on one. Reads the painted
   * line ({@link rowRef}), so the unit just passed already counts as passed; a
   * line with every unit passed opens the carton's next open line.
   */
  const advanceAfterPrint = useCallback(
    async (passedSerialId: number) => {
      const current = rowRef.current;
      const serials = current.serials ?? [];
      const from = serials.findIndex((s) => s.id === passedSerialId);
      const cap = Math.max(serials.length, current.quantity_expected ?? serials.length);
      for (let step = 1; step <= cap; step++) {
        const i = (from + step) % cap;
        if (i === from) continue;
        const s = serials[i];
        if (!s || unitStatusToVerdict(s.current_status) !== 'PASS') {
          setActiveSlotByLine((m) => ({ ...m, [current.id]: i }));
          return;
        }
      }
      const next = await findNextOpenSibling(current);
      if (next) {
        dispatchSelectLine(next);
      } else {
        toast.success('Carton complete — all units tested', { duration: 2500 });
      }
    },
    [findNextOpenSibling],
  );

  /**
   * Pass — one press passes a unit and prints its label: the dock button, the
   * verdict row's Pass (bar and unit rows), Enter and `P`. Print, paint, then —
   * once the print is dispatched — one fire-and-forget request and the
   * advance: nothing awaited on the network, nothing greyed, every press stands
   * alone. Pass on a passed unit reprints; on a failed unit it passes and prints.
   */
  const pressPass = useCallback(
    (serial: UnitSlotSerial) => {
      const live = (rowRef.current.serials ?? []).find((s) => s.id === serial.id) ?? serial;
      const wasPassed = unitStatusToVerdict(live.current_status) === 'PASS';
      const lineId = rowRef.current.id;
      pinSlot(lineId, serial.id);
      void printAndRecord(serial, !wasPassed).then((printed) => {
        if (printed && rowRef.current.id === lineId) void advanceAfterPrint(serial.id);
      });
    },
    [printAndRecord, pinSlot, advanceAfterPrint],
  );

  const handlePrimary = useCallback(() => {
    if (!activeSerial) {
      toast.info('Scan a serial for this slot before printing.');
      return;
    }
    pressPass(activeSerial);
  }, [activeSerial, pressPass]);

  /** Save & print with a draft — the same print-first path; prints, never passes. */
  const handleApplyAndPrint = useCallback(
    (draft: TestingLabelDraft) => {
      if (!activeSerial) {
        toast.info('Scan a serial for this slot before printing.');
        return;
      }
      if (unitStatusToVerdict(activeSerial.current_status) !== 'PASS') {
        toast.info('Mark this unit Pass before printing.');
        return;
      }
      void printAndRecord(activeSerial, false, draft);
    },
    [activeSerial, printAndRecord],
  );

  /**
   * The ONE door every verdict press goes through. Pass on the open line is
   * {@link pressPass} (print first); Test again saves through `/test`; Fail
   * asks for its fault first.
   */
  const requestSlotVerdict = useCallback(
    (lineId: number, serial: UnitSlotSerial, next: TestingVerdict) => {
      if (next === 'PASS' && lineId === rowRef.current.id) {
        pressPass(serial);
        return;
      }
      if (next === 'TESTING_FAILED') {
        setPendingFail({
          lineId,
          serials: [serial],
          label: serial.serial_number || 'this unit',
        });
        return;
      }
      void handleSlotVerdict(lineId, serial, next, null);
    },
    [handleSlotVerdict, pressPass],
  );

  /** Line grain — the same gate. One fault covers every unit the press failed. */
  const requestLineVerdict = useCallback(
    (lineId: number, serials: ReadonlyArray<UnitSlotSerial>, next: TestingVerdict) => {
      const targets = serials.filter((s) => s.id != null);
      if (next === 'PASS' && lineId === rowRef.current.id && targets.length === 1) {
        pressPass(targets[0]);
        return;
      }
      if (next === 'TESTING_FAILED') {
        if (targets.length === 0) {
          toast.info('Scan a serial first, then set a verdict.');
          return;
        }
        setPendingFail({
          lineId,
          serials: targets,
          label:
            targets.length === 1
              ? targets[0].serial_number || 'this unit'
              : `${targets.length} units`,
        });
        return;
      }
      void applyLineVerdict(lineId, serials, next, null);
    },
    [applyLineVerdict, pressPass],
  );

  // ── Unbox-shaped label bag (UnboxLabelPreview + WorkspaceNotesCard) ────────
  // Dock draft live-drives the carton face center; save still patches `notes`
  // only. Durable `label_note` stamps on carton print via useCartonLabelEditor.
  const liveCartonPayload = useMemo(
    () =>
      cartonLabel.defaultPayload
        ? { ...cartonLabel.defaultPayload, notes: itemNote }
        : null,
    [cartonLabel.defaultPayload, itemNote],
  );

  const unitInput = useMemo(() => {
    if (!row.sku) return null;
    return {
      sku: activeUnitUid || row.sku,
      title: lineTitle,
      serialNumber: activeSerial?.serial_number ?? undefined,
      gtin: labelGtin ?? undefined,
      orgSlug,
      condition: row.condition_grade || 'USED_A',
      color: labelColor || undefined,
    };
  }, [
    row.sku,
    row.condition_grade,
    activeSerial,
    activeUnitUid,
    labelGtin,
    lineTitle,
    orgSlug,
    labelColor,
  ]);

  const labelCtx: WorkspaceLabelContext = useMemo(
    () => ({
      hasCarton: row.receiving_id != null && row.receiving_id > 0,
      scanValue: core.poNumber || (row.receiving_id != null ? `RCV-${row.receiving_id}` : ''),
      sku: row.sku,
      receivingType: core.receivingType,
      disclosureNote: row.label_note,
      ticketDigits: core.zendeskTrimmed,
      cartonPayload: liveCartonPayload,
      unitInput,
    }),
    [
      row.receiving_id,
      row.sku,
      row.label_note,
      core.poNumber,
      core.receivingType,
      core.zendeskTrimmed,
      liveCartonPayload,
      unitInput,
    ],
  );

  const labelOptions = useMemo(
    () => listAvailableLabelOptions(TESTING_LABEL_KINDS, labelCtx),
    [labelCtx],
  );
  const labelSelectOptions = useMemo(() => labelOptionsForSelect(labelOptions), [labelOptions]);

  const [selectedLabelKind, setSelectedLabelKind] = useState<string>('unit');
  const [labelEditorRequestId, setLabelEditorRequestId] = useState(0);
  const requestLabelEditor = useCallback(() => {
    setLabelEditorRequestId((n) => n + 1);
  }, []);
  useEffect(() => {
    setSelectedLabelKind('unit');
  }, [row.id]);

  const activeLabelKind = resolveActiveLabelKind(selectedLabelKind, labelOptions, 'unit');
  const activeLabelFace = useMemo(
    () => workspaceLabelToFace(activeLabelKind, labelCtx),
    [activeLabelKind, labelCtx],
  );

  const labelPayload = liveCartonPayload;
  const labelDraftDefaults = cartonLabel.draftDefaults;
  const buildLabelPayload = cartonLabel.buildPayload;
  const applyAndPrintLabel = useCallback(
    (draft: LabelEditDraft) => {
      cartonLabel.applyAndPrint(draft);
    },
    [cartonLabel],
  );

  /** UnboxLabelPreview unit Save & print → same path as Pass · Print draft. */
  const applyUnitAndPrint = useCallback(
    (draft: TestingLabelDraft) => {
      handleApplyAndPrint(draft);
    },
    [handleApplyAndPrint],
  );

  const isUnfound = shouldUseLocalReceiveOnly(row);

  return {
    ...core,
    itemNote, setItemNote,
    notes, setNotes,
    serialSubmitting, headerSerialEdit, setHeaderSerialEdit,
    activeSlotByLine, setActiveSlotByLine, activeSlot, activeSerial,
    handleSlotVerdict, requestSlotVerdict, requestLineVerdict, refreshLineWithSerials,
    handleSlotCondition, applyLineVerdict, deriveLineVerdict,
    pendingFail, confirmPendingFail, cancelPendingFail,
    enqueueSerial, deleteSerial, replaceSerial,
    handlePrimary, handleApplyAndPrint,
    // Editable carton label — preview payload + editor draft/build/apply (the
    // label preview's Carton option; pencil → LabelEditPopover → Save & print).
    cartonLabelPayload: cartonLabel.defaultPayload,
    cartonLabelDraftDefaults: cartonLabel.draftDefaults,
    buildCartonLabelPayload: cartonLabel.buildPayload,
    applyCartonLabel: cartonLabel.applyAndPrint,
    // UnboxLabelPreview contract
    labelSelectOptions, selectedLabelKind, setSelectedLabelKind, activeLabelKind,
    labelEditorRequestId, requestLabelEditor,
    activeLabelFace, unitInput, applyUnitAndPrint,
    labelPayload, labelDraftDefaults, buildLabelPayload, applyAndPrintLabel,
    setLabelCornerMode: cartonLabel.setCornerMode,
    patchLabelOverride: cartonLabel.patchLabelOverride,
    labelOptions,
    isUnfound,
    prevLineNotes: '',
    claimOpen, setClaimOpen, claimInitialMode, openClaimModal,
  };
}
