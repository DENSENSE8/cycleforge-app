'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { RepairWorkbenchDock, type RepairDockVerb } from '@/components/mobile/repair/RepairWorkbenchDock';
import { RepairStatusSheet } from '@/components/mobile/repair/RepairStatusSheet';
import { RepairInfoCard } from '@/components/mobile/repair/RepairInfoCard';
import { RepairPickupSheet } from '@/components/mobile/repair/RepairPickupSheet';
import { DetailHubScreen } from '@/design-system/components/DetailHubScreen';
import { useRepairHubRows } from '@/components/mobile/repair/useRepairHubRows';
import { useRepairRecord } from '@/components/mobile/repair/useRepairWorkbench';
import { useActivityInboxOptional } from '@/contexts/ActivityInboxContext';
import { canStartRepairPickup, repairStatusOperatorLabel } from '@/lib/repair-status';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import { currentStatusEntry } from '@/lib/repair/repair-history';
import { formatMonthDayTimePST } from '@/utils/date';

function daysSince(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d <= 0) return 'today';
  if (d === 1) return '1 day in shop';
  return `${d} days in shop`;
}

/**
 * `/m/rs/[id]` — the repair HUB, on {@link DetailHubScreen} (the exoskeleton's
 * reference). A read-only summary card on top (device, issue, customer + phone,
 * serial, status) that opens `/info` for every fact and the edit, then doors to
 * contextual screens from the `useRepairHubRows` registry — a new screen plugs
 * in there, not here. Status and Pickup stay here as dock sheets; Log work
 * opens the bench screen.
 */
function RepairHubInner() {
  const params = useParams<{ id: string }>();
  const repairId = Number(params?.id);
  const router = useRouter();
  const inbox = useActivityInboxOptional();
  const { repair, setRepair, error, loading, reload } = useRepairRecord(repairId);
  const hubRows = useRepairHubRows(repairId, repair);

  const [sheet, setSheet] = useState<Exclude<RepairDockVerb, 'log'> | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);

  /**
   * The one status write. Optimistic so the badge moves under the thumb; the
   * previous value comes back on failure. The server appends `status_history`
   * with its own clock, so the acknowledgement reads the refetched stamp.
   */
  const handleStatusSave = useCallback(
    async (next: string) => {
      if (!repair || statusSaving) return;
      const previous = repair.status ?? '';
      if (previous === next) return;
      setStatusSaving(true);
      setStatusError(null);
      setRepair({ ...repair, status: next });
      try {
        const res = await fetch('/api/repair-service', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: repair.id, status: next }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || `HTTP ${res.status}`);
        }
        inbox?.pushRepairStatusChange({ repairId: repair.id, previousStatus: previous, nextStatus: next });
        const fresh = await reload();
        const stamp = fresh ? currentStatusEntry(fresh)?.timestamp : null;
        setAck(
          `Status saved — ${repairStatusOperatorLabel(next)}${stamp ? ` · ${formatMonthDayTimePST(stamp)}` : ''}`,
        );
        setSheet(null);
      } catch (err) {
        setRepair((current) => (current ? { ...current, status: previous } : current));
        setStatusError(err instanceof Error ? err.message : 'Status update failed');
      } finally {
        setStatusSaving(false);
      }
    },
    [repair, statusSaving, inbox, reload, setRepair],
  );

  const openVerb = useCallback(
    (verb: RepairDockVerb) => {
      if (verb === 'log') {
        router.push(`/m/rs/${repairId}/work?log=1`);
        return;
      }
      setStatusError(null);
      setSheet(verb);
    },
    [router, repairId],
  );

  const rsCode = `RS-${repairId}`;
  const contact = useMemo(() => (repair ? resolveRepairContact(repair) : null), [repair]);

  return (
    // Repair is a decide-and-record job: triage mode owns neutral geometry;
    // repair status colour stays semantic and does not remap.
    <DetailHubScreen
      record={repair}
      state={{ loading, error }}
      bar={{ title: rsCode, mono: true, meta: (r) => daysSince(r.created_at) || undefined }}
      card={(r) => (
        <RepairInfoCard
          href={`/m/rs/${repairId}/info`}
          status={r.status || null}
          device={r.product_title || ''}
          issue={r.issue || ''}
          serial={r.serial_number || ''}
          customer={contact?.name ?? null}
          phone={contact?.phone ?? null}
        />
      )}
      ack={ack}
      onAckDismiss={() => setAck(null)}
      rowsLabel="Repair screens"
      rows={() => hubRows}
      dock={(r) => <RepairWorkbenchDock pickupEnabled={canStartRepairPickup(r.status)} onOpen={openVerb} />}
    >
      {(r) => (
        <>
          <RepairStatusSheet
            open={sheet === 'status'}
            current={r.status ?? null}
            saving={statusSaving}
            error={statusError}
            onSave={(next) => void handleStatusSave(next)}
            onClose={() => setSheet(null)}
          />
          <RepairPickupSheet
            open={sheet === 'pickup'}
            repair={r}
            onClose={() => setSheet(null)}
            onPicked={() => void reload()}
          />
        </>
      )}
    </DetailHubScreen>
  );
}

export default function RepairHubPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <RepairHubInner />
    </Suspense>
  );
}
