'use client';

/**
 * The open local pickup — its `pickupRecordModel` wired to the floor's own
 * calls, plus the record-header batch verbs (owner 2026-09-29, Step 3):
 * Grade selected · Print labels for passed · Assign tester (· Tickets). The
 * desk (`/pickup`) mounts it through `useRecordSlot`; the phone
 * (`/m/receiving/pickup`) through the same slot on its own page.
 *
 * Every write is an existing receiving route — line grade
 * (`/api/receiving/lines/:id/condition`), unit grade (`…/units/:unitId/condition`),
 * unit labels (`printReceivingLineLabelsByIds`), the QC verdict
 * (`/api/serial-units/:id/test`), the tester (`patchLineQcAssignee`) — and
 * each ends by refetching the pickup feed.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Printer, Star, Ticket, User } from '@/components/Icons';
import { TicketDisplayHost } from '@/components/receiving/workspace/line-edit/TicketDisplayHost';
import { InboundEvidencePhotosButton } from '@/components/receiving/record/InboundEvidencePhotosButton';
import { TicketLinkPopover } from '@/components/support/context/TicketLinkPopover';
import { SupportCreateTicketModal } from '@/components/support/service-workspace/SupportCreateTicketModal';
import { useSupportTicketClaimHost } from '@/components/support/service-workspace/useSupportTicketClaimHost';
import { InlineStageAssign } from '@/design-system/components/record-ledger/InlineStageAssign';
import type { RecordModel, RecordVerb } from '@/design-system/components/record-ledger/record-model';
import { Button } from '@/design-system/primitives';
import { RECORD_ID_CLASS } from '@/design-system/tokens/record';
import { useEntitySupportTicket } from '@/hooks/useEntitySupportTicket';
import { useStaffNameMap } from '@/hooks/useStaffNameMap';
import { conditionOptions } from '@/lib/conditions';
import { patchLineQcAssignee } from '@/lib/qc/qc-assignee-client';
import { printReceivingLineLabelsByIds } from '@/lib/receiving/print-receiving-line-labels';
import { safeRandomUUID } from '@/lib/safe-uuid';
import type { TestVerdict } from '@/lib/tech/recordTestVerdict';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import type { PickupCardModel } from './pickup-card-model';
import { pickupItemMatches, pickupUnits, plural, type PickupItemFilter, type PickupUnitView } from './pickup-ladder';
import type { PickupLine } from './pickup-lines';
import { pickupRecordModel } from './pickup-record-model';

const PICKUP_LINES_KEY = ['local-pickup-lines'] as const;

/** The house `{ success | ok, error, message }` envelope's failure words. */
async function failureOf(res: Response, fallback: string): Promise<string | null> {
  if (res.ok) return null;
  const body = (await res.json().catch(() => null)) as { error?: unknown; message?: unknown } | null;
  const message = typeof body?.message === 'string' ? body.message : typeof body?.error === 'string' ? body.error : '';
  return message.trim() || `${fallback} (HTTP ${res.status})`;
}

/**
 * Grade every checked item: the line's grade (what its labels print), and each
 * unit its label already minted. One grade for the batch, like the Unbox bench's
 * "All units" picker.
 */
function GradePanel({ rows, onDone }: { rows: readonly PickupLine[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const units = rows.flatMap((row) => (row.unit_stage_facts ?? []).map((fact) => ({ lineId: row.receiving_line_id!, unitId: fact.receiving_line_unit_id })));
  const grade = async (value: string) => {
    setBusy(value);
    const writes = [
      ...rows.map((row) =>
        fetch(`/api/receiving/lines/${row.receiving_line_id}/condition`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ condition_grade: value }),
        }),
      ),
      ...units.map((unit) =>
        fetch(`/api/receiving/lines/${unit.lineId}/units/${unit.unitId}/condition`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ condition_grade: value }),
        }),
      ),
    ];
    const results = await Promise.allSettled(writes);
    const failures = (
      await Promise.all(results.map((result) => (result.status === 'fulfilled' ? failureOf(result.value, 'Grade not saved') : 'Grade not saved')))
    ).filter(Boolean);
    await queryClient.invalidateQueries({ queryKey: PICKUP_LINES_KEY });
    setBusy(null);
    if (failures.length > 0) {
      toast.error(`${failures.length} of ${writes.length} grades not saved — ${failures[0]}`);
      return;
    }
    toast.success(`Graded ${plural(rows.length, 'item')}`);
    onDone();
  };
  return (
    <div className="flex flex-col gap-3" data-testid="pickup-grade-panel">
      <p className="text-role-data text-mode-muted">
        One grade for {plural(rows.length, 'checked item')}
        {units.length > 0 ? ` and ${plural(units.length, 'labelled unit')}` : ''}.
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Condition grade">
        {conditionOptions('option').map((option) => (
          <Button
            key={option.value}
            type="button"
            variant="secondary"
            size="md"
            loading={busy === option.value}
            disabled={busy != null}
            onClick={() => void grade(option.value)}
            data-testid={`pickup-grade-${option.value.toLowerCase()}`}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** One tester for the checked items (else every item still to test). */
function AssignTesterPanel({ rows, onDone }: { rows: readonly PickupLine[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const { getStaffName } = useStaffNameMap();
  const ids = [...new Set(rows.map((row) => row.assigned_tech_id ?? null))];
  const current = ids.length === 1 ? ids[0]! : null;
  return (
    <div className="flex flex-col gap-3" data-testid="pickup-assign-panel">
      <p className="text-role-data text-mode-muted">Assign one tester to {plural(rows.length, 'item')}.</p>
      <InlineStageAssign
        label="tester"
        role="technician"
        selectedStaffId={current}
        assignedName={current ? getStaffName(current) : null}
        onCommit={(staffId) => {
          void Promise.all(rows.map((row) => patchLineQcAssignee(row.receiving_line_id!, staffId)))
            .then(async () => {
              await queryClient.invalidateQueries({ queryKey: PICKUP_LINES_KEY });
              toast.success(staffId ? `Tester assigned to ${plural(rows.length, 'item')}` : 'Tester cleared');
              onDone();
            })
            .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Could not assign the tester'));
        }}
        testId="pickup-assign-tester"
      />
    </div>
  );
}

interface TicketTarget {
  serialUnitId: number;
  lineId: number | null;
  receivingId: number | null;
  identity: string;
  projectedTicketId: number;
}

/** A linked ticket's thread, in place — the provider thread via `TicketDisplayHost`. */
function PickupTicketThread({ target, onClose }: { target: TicketTarget; onClose: () => void }) {
  const ticket = useEntitySupportTicket({ serialUnitId: target.serialUnitId, lineId: target.lineId, receivingId: target.receivingId });
  const providerTicketId = ticket.data?.providerTicketId ?? null;
  if (ticket.isLoading) return <p className="py-4 text-role-data text-mode-muted">Loading ticket…</p>;
  if (ticket.isError || providerTicketId == null) {
    return (
      <div className="flex flex-col items-start gap-3 py-4">
        <p className="text-role-data text-mode-muted">Ticket #{target.projectedTicketId} is linked, but its provider thread is unavailable.</p>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Back to units
        </Button>
      </div>
    );
  }
  return (
    <div className="h-[min(72vh,52rem)] min-h-0">
      <TicketDisplayHost receivingId={target.receivingId} ticketId={providerTicketId} onCloseTicket={onClose} />
    </div>
  );
}

/** Failed and ticketed units: open the linked ticket, file a new one, or link an existing one. */
function PickupTicketsPanel({ units }: { units: readonly { unit: PickupUnitView; row: PickupLine }[] }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const claim = useSupportTicketClaimHost();
  const [open, setOpen] = useState<TicketTarget | null>(null);
  const [creating, setCreating] = useState<TicketTarget | null>(null);
  const [linking, setLinking] = useState<number | null>(null);
  if (open) return <PickupTicketThread target={open} onClose={() => setOpen(null)} />;
  return (
    <div className="flex flex-col" data-testid="pickup-tickets-panel">
      {units.map(({ unit, row }) => {
        const serialUnitId = unit.fact!.serial_unit_id!;
        const target: TicketTarget = {
          serialUnitId,
          lineId: row.receiving_line_id ?? null,
          receivingId: row.receiving_id,
          identity: unit.identity,
          projectedTicketId: unit.fact!.primary_support_ticket_id ?? 0,
        };
        return (
          <div key={unit.key} className="flex min-w-0 flex-col gap-2 border-b border-mode-fact py-2 last:border-b-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className={cn(RECORD_ID_CLASS, 'min-w-0 flex-1 truncate')}>{unit.identity}</span>
              <span className="min-w-0 truncate text-role-caption text-mode-muted">{row.product_title || row.sku}</span>
              {target.projectedTicketId ? (
                <Button type="button" variant="secondary" size="sm" icon={<Ticket aria-hidden />} onClick={() => setOpen(target)}>
                  Ticket #{target.projectedTicketId}
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={<Ticket aria-hidden />}
                    onClick={() => {
                      setCreating(target);
                      claim.openCreate({ type: 'serialUnit', serialUnitId });
                    }}
                  >
                    New ticket
                  </Button>
                  <Button type="button" variant="secondary" size="sm" icon={<Ticket aria-hidden />} onClick={() => setLinking((id) => (id === serialUnitId ? null : serialUnitId))}>
                    Link ticket
                  </Button>
                </>
              )}
              <Button type="button" variant="ghost" size="sm" icon={<ExternalLink aria-hidden />} onClick={() => router.push(`/inventory/units?unit=${serialUnitId}`)}>
                Open unit
              </Button>
            </div>
            {linking === serialUnitId ? (
              <TicketLinkPopover
                linkable={{ canLinkTicket: true, anchorType: 'serialUnit', anchorId: serialUnitId, serialUnitId }}
                open
                onClose={() => setLinking(null)}
                onLinked={() => void queryClient.invalidateQueries({ queryKey: PICKUP_LINES_KEY })}
                title={`Link ticket to ${unit.identity}`}
              />
            ) : null}
          </div>
        );
      })}
      <SupportCreateTicketModal
        open={claim.createOpen}
        defaultSubject={creating ? `Receiving failure · ${creating.identity}` : 'Receiving failure'}
        submitting={claim.createTicket.isPending}
        onClose={() => {
          claim.closeCreate();
          setCreating(null);
        }}
        onCreate={({ subject, note, linkages }) =>
          claim.createTicket.mutate(
            { subject, note, linkages },
            {
              onSuccess: (data) => {
                if (creating) setOpen({ ...creating, projectedTicketId: data.supportTicketId });
                setCreating(null);
                void queryClient.invalidateQueries({ queryKey: PICKUP_LINES_KEY });
              },
            },
          )
        }
      />
    </div>
  );
}

/**
 * The open pickup's model and header verbs; null when none is open. Filter
 * and selection belong to the open pickup — walking to another resets them.
 */
export function usePickupRecord(
  order: PickupCardModel | null,
  { capturePhotos = false }: { capturePhotos?: boolean } = {},
): { model: RecordModel; verbs: RecordVerb[] } | null {
  const queryClient = useQueryClient();
  const key = order?.key ?? null;
  const [scope, setScope] = useState<{ key: string | null; filter: PickupItemFilter; selected: ReadonlySet<number> }>({
    key,
    filter: 'all',
    selected: new Set(),
  });
  const [printingLineId, setPrintingLineId] = useState<number | null>(null);
  const [verdictUnitId, setVerdictUnitId] = useState<number | null>(null);
  const current = scope.key === key ? scope : { key, filter: 'all' as const, selected: new Set<number>() };

  const refresh = useCallback(() => void queryClient.invalidateQueries({ queryKey: PICKUP_LINES_KEY }), [queryClient]);

  const printLines = useCallback(
    async (lineIds: readonly number[]) => {
      await printReceivingLineLabelsByIds(lineIds);
      await queryClient.invalidateQueries({ queryKey: PICKUP_LINES_KEY });
    },
    [queryClient],
  );

  const recordVerdict = useCallback(
    async (serialUnitId: number, verdict: TestVerdict) => {
      setVerdictUnitId(serialUnitId);
      try {
        const res = await fetch(`/api/serial-units/${serialUnitId}/test`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ verdict, notes: null, client_event_id: safeRandomUUID() }),
        });
        const failure = await failureOf(res, 'Verdict not recorded');
        if (failure) toast.error(failure);
        await queryClient.invalidateQueries({ queryKey: PICKUP_LINES_KEY });
      } catch {
        toast.error('Verdict not recorded — cannot reach the server');
      } finally {
        setVerdictUnitId(null);
      }
    },
    [queryClient],
  );

  return useMemo(() => {
    if (!order) return null;
    const rows = order.rows;
    const onLine = rows.filter((row) => row.receiving_line_id);
    const checked = onLine.filter((row) => current.selected.has(row.id));
    const toTest = onLine.filter((row) => pickupItemMatches(row, 'test'));
    const passedLines = onLine.filter((row) => pickupUnits(row).some((unit) => unit.qc === 'PASSED'));
    const ticketUnits = onLine.flatMap((row) =>
      pickupUnits(row)
        .filter((unit) => unit.fact?.serial_unit_id && (unit.qc === 'FAILED' || unit.fact.primary_support_ticket_id))
        .map((unit) => ({ unit, row })),
    );
    const assignScope = checked.length > 0 ? checked : toTest;
    const setSelected = (selected: ReadonlySet<number>) => setScope({ ...current, selected });

    const photos: ReactNode = (
      <InboundEvidencePhotosButton key={`photos:${order.key}`} receivingId={order.line.receiving_id} poRef={order.line.po_number} />
    );
    const model = pickupRecordModel(order, {
      filter: current.filter,
      onFilter: (filter) => setScope({ ...current, filter }),
      selected: current.selected,
      onToggle: (itemId) => {
        const next = new Set(current.selected);
        if (!next.delete(itemId)) next.add(itemId);
        setSelected(next);
      },
      onSelectAll: (itemIds) => setSelected(new Set(itemIds)),
      printingLineId,
      onPrintLine: (lineId) => {
        setPrintingLineId(lineId);
        void printLines([lineId]).finally(() => setPrintingLineId(null));
      },
      verdictUnitId,
      onVerdict: (serialUnitId, verdict) => void recordVerdict(serialUnitId, verdict),
      onAssignTester: (staffId) =>
        Promise.all(toTest.map((row) => patchLineQcAssignee(row.receiving_line_id!, staffId))).then(refresh),
      refresh,
      capturePhotos,
      photos,
    });

    const verbs: RecordVerb[] = [
      {
        id: 'grade',
        label: checked.length > 0 ? `Grade selected (${checked.length})` : 'Grade selected',
        icon: <Star aria-hidden />,
        tone: 'blue',
        disabled: checked.length === 0,
        disabledReason: 'Check the items to grade',
        panel: (done) => (
          <GradePanel
            rows={checked}
            onDone={() => {
              setSelected(new Set());
              done();
            }}
          />
        ),
      },
      {
        id: 'print-passed',
        label: 'Print labels for passed',
        icon: <Printer aria-hidden />,
        disabled: passedLines.length === 0,
        disabledReason: 'No unit has passed QC yet',
        run: () => printLines(passedLines.map((row) => row.receiving_line_id!)),
      },
      {
        id: 'assign-tester',
        label: checked.length > 0 ? `Assign tester (${checked.length})` : 'Assign tester',
        icon: <User aria-hidden />,
        disabled: assignScope.length === 0,
        disabledReason: 'Nothing left to test',
        panel: (done) => <AssignTesterPanel rows={assignScope} onDone={done} />,
      },
      {
        id: 'tickets',
        label: ticketUnits.length > 0 ? `Tickets (${ticketUnits.length})` : 'Tickets',
        icon: <Ticket aria-hidden />,
        disabled: ticketUnits.length === 0,
        disabledReason: 'No failed or ticketed unit',
        panel: () => <PickupTicketsPanel units={ticketUnits} />,
      },
    ];
    return { model, verbs };
  }, [order, current, printingLineId, verdictUnitId, printLines, recordVerdict, refresh, capturePhotos]);
}
