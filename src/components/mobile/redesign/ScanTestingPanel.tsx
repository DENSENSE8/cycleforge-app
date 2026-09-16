'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, ShieldCheck } from '@/components/Icons';
import { OrderIdChip, TrackingChip, SerialChip, getLast8 } from '@/components/ui/CopyChip';
import {
  joinStackedIdentityKeys,
  StackedRowIdentity,
} from '@/components/ui/StackedRowIdentity';
import { conditionGradeTableLabel } from '@/lib/receiving/receiving-constants';
import { TestingLinePanel, type UnitSlotSerial } from '@/components/tech/TestingUnitSlots';
import {
  type TestingVerdict,
  unitStatusToVerdict,
} from '@/components/receiving/workspace/TestingStatusPills';
import { resolveTestingScan } from '@/lib/testing/resolve-testing-scan';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

type State = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

/** failure dominates → re-test → all-pass → none (mirrors TechTestingWorkspace). */
function deriveLineVerdict(serials: ReadonlyArray<UnitSlotSerial>): TestingVerdict | null {
  const verdicts = serials.map((s) => unitStatusToVerdict(s.current_status));
  if (verdicts.length === 0) return null;
  if (verdicts.some((v) => v === 'TESTING_FAILED')) return 'TESTING_FAILED';
  if (verdicts.some((v) => v === 'TEST_AGAIN')) return 'TEST_AGAIN';
  if (verdicts.every((v) => v === 'PASS')) return 'PASS';
  return null;
}

function toSlotSerials(line: ReceivingLineRow): UnitSlotSerial[] {
  return (line.serials ?? []).map((s) => ({
    id: s.id,
    serial_number: s.serial_number,
    current_status: s.current_status,
    condition_grade: s.condition_grade ?? null,
  }));
}

/**
 * Inline "PO ITEMS" testing surface for the mobile Scan page's Testing mode.
 * Scanning a PO / carton label (`R-####`) resolves to its receiving line(s);
 * each renders the shared {@link TestingLinePanel} (PASS / TEST AGAIN / TESTING
 * FAILED pills + serial entry). Verdict and serial writes reuse the same
 * endpoints as the desktop tech workspace:
 *   - verdict     → POST /api/serial-units/{id}/test
 *   - add serial  → POST  /api/receiving/scan-serial
 *   - del serial  → DELETE /api/receiving/scan-serial
 */
export function ScanTestingPanel({ query }: { query: string }) {
  const { user } = useAuth();
  const staffId = user?.staffId ?? 0;

  const [state, setState] = useState<State>('idle');
  const [lines, setLines] = useState<ReceivingLineRow[]>([]);
  const [isMutating, setIsMutating] = useState(false);
  const [serialSubmitting, setSerialSubmitting] = useState(false);
  const receivingIdRef = useRef<number | null>(null);

  // Refetch the carton's lines (with serials) so verdict/serial writes reflect.
  const refetch = useCallback(async () => {
    const receivingId = receivingIdRef.current;
    if (!receivingId) return;
    try {
      const res = await fetch(`/api/receiving-lines?receiving_id=${receivingId}&include=serials`);
      if (!res.ok) return;
      const data = await res.json();
      const rows = (data?.receiving_lines ?? []) as ReceivingLineRow[];
      if (rows.length > 0) setLines(rows);
    } catch {
      /* keep current */
    }
  }, []);

  // Resolve the scanned PO/carton label to its lines whenever the query changes.
  useEffect(() => {
    let cancelled = false;
    const value = (query ?? '').trim();
    if (!value) {
      setState('idle');
      setLines([]);
      receivingIdRef.current = null;
      return;
    }
    setState('loading');
    void (async () => {
      const result = await resolveTestingScan(value);
      if (cancelled) return;
      if (result.kind === 'line') {
        receivingIdRef.current = result.row.receiving_id ?? null;
        setLines([result.row]);
        setState('ready');
      } else if (result.kind === 'multi' || result.kind === 'box') {
        // A box (H-####) scan on mobile lists its lines just like a multi match
        // (the desktop box drawer is a workbench-only affordance).
        receivingIdRef.current = result.receivingId || (result.rows[0]?.receiving_id ?? null);
        setLines(result.rows);
        setState('ready');
      } else if (result.kind === 'not_found' || result.kind === 'manifest') {
        // No mobile manifest surface — a KIT- scan resolves to nothing here.
        setLines([]);
        setState('empty');
      } else {
        setLines([]);
        setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  // ── mutations (mirror TechTestingWorkspace) ───────────────────────────────
  const applyLineVerdict = useCallback(
    async (lineId: number, serials: ReadonlyArray<UnitSlotSerial>, next: TestingVerdict) => {
      if (serials.length === 0) return;
      setIsMutating(true);
      try {
        for (const s of serials) {
          const res = await fetch(`/api/serial-units/${s.id}/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ verdict: next, client_event_id: `m-test-${s.id}-${next}` }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.ok) {
            toast.error(data?.error || `Verdict save failed (${res.status})`);
            return;
          }
        }
        await refetch();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Verdict request failed');
      } finally {
        setIsMutating(false);
      }
    },
    [refetch],
  );

  const addSerial = useCallback(
    async (lineId: number, sn: string) => {
      const serial = (sn ?? '').trim();
      const receivingId = receivingIdRef.current;
      if (!serial || !receivingId || serialSubmitting) return;
      setSerialSubmitting(true);
      try {
        const res = await fetch('/api/receiving/scan-serial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            receiving_id: receivingId,
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
        await refetch();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Network error scanning serial');
      } finally {
        setSerialSubmitting(false);
      }
    },
    [staffId, serialSubmitting, refetch],
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
        await refetch();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Remove failed');
      }
    },
    [refetch],
  );

  if (state === 'idle') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center opacity-50">
        <ShieldCheck className="mb-3 h-10 w-10 text-text-faint" />
        <p className="text-xs font-semibold uppercase tracking-widest text-text-faint">Scan a PO label to test</p>
      </div>
    );
  }
  if (state === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center py-12 text-text-faint">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (state === 'empty' || state === 'error') {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-rose-400">
          {state === 'empty' ? 'No PO found for that label' : 'Lookup failed'}
        </p>
      </div>
    );
  }

  return (
    <div className="px-3 pb-32">
      <p className="px-1 pb-2 pt-1 text-role-caption font-semibold uppercase tracking-[0.2em] text-text-faint">
        PO Items · {lines.length}
      </p>
      <div className="flex flex-col gap-3">
        {lines.map((line) => {
          const slots = toSlotSerials(line);
          const verdict = deriveLineVerdict(slots);
          const title = line.item_name || line.sku || line.zoho_item_id || `Line #${line.id}`;
          const po = (line.zoho_purchaseorder_number || line.zoho_purchaseorder_id || '').toString().trim();
          const tracking = (line.tracking_number || '').trim();
          const serialsCsv = slots.map((s) => s.serial_number).filter(Boolean).join(', ');
          const qty = `${line.quantity_received}/${line.quantity_expected ?? '?'}`;
          const cond = conditionGradeTableLabel(line.condition_grade);
          return (
            <div key={line.id} className="rounded-none border border-border-soft bg-surface-card p-4 shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)]">
              <StackedRowIdentity
                title={
                  <p className="text-base font-semibold leading-snug tracking-tight text-text-default">
                    {title}
                  </p>
                }
                keys={joinStackedIdentityKeys([
                  <span
                    key="qty-cond"
                    className="flex shrink-0 items-center gap-1 whitespace-nowrap text-role-caption font-semibold uppercase tracking-widest text-text-soft"
                  >
                    <span className="text-text-default">{qty}</span>
                    <span className="text-text-faint">·</span>
                    <span>{cond}</span>
                  </span>,
                  <OrderIdChip key="po" value={po} display={getLast8(po)} dense />,
                  <TrackingChip
                    key="tracking"
                    value={tracking}
                    display={getLast8(tracking)}
                    dense
                  />,
                  <SerialChip key="serial" value={serialsCsv} width="w-auto" />,
                ])}
              />

              <div className="mt-4 border-t border-border-hairline pt-3">
                <TestingLinePanel
                  lineId={line.id}
                  saved={slots}
                  expected={line.quantity_expected}
                  verdict={verdict}
                  isMutating={isMutating}
                  isSubmitting={serialSubmitting}
                  autoFocus
                  onSetVerdict={(next) => void applyLineVerdict(line.id, slots, next)}
                  onSetUnitVerdict={(serial, next) => void applyLineVerdict(line.id, [serial], next)}
                  onAddSerial={(sn) => void addSerial(line.id, sn)}
                  onDeleteSerial={(s) => void deleteSerial(line.id, s.id)}
                  onReplaceSerial={(original, next) => {
                    void (async () => {
                      await deleteSerial(line.id, original.id);
                      await addSerial(line.id, next);
                    })();
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
