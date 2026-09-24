'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { DetailAck, DetailFactRow } from '@/components/mobile/detail/DetailParts';
import { RepairInfoEditSheet } from '@/components/mobile/repair/RepairInfoEditSheet';
import { useRepairInfoSave } from '@/components/mobile/repair/useRepairInfoSave';
import { useRepairRecord } from '@/components/mobile/repair/useRepairWorkbench';
import { repairStatusBadgeClass, repairStatusOperatorLabel } from '@/lib/repair-status';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import { currentStatusEntry } from '@/lib/repair/repair-history';
import type { RepairInfoDraft } from '@/lib/repair/repair-info-edit';
import { formatMonthDayTimePST } from '@/utils/date';
import { IconButton, Panel } from '@/design-system/primitives';
import { Pencil } from '@/components/Icons';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/**
 * `/m/rs/[id]/info` — the depth behind the hub's summary card: every repair
 * fact in full (the stored listing title, full contact, price, notes) and the
 * one full edit, opened from the pencil in the bar. Status stays a dock verb
 * on the hub.
 */
function RepairInfoInner() {
  const params = useParams<{ id: string }>();
  const repairId = Number(params?.id);
  const { repair, setRepair, error, loading, reload } = useRepairRecord(repairId);
  const { save, saving } = useRepairInfoSave(repair, setRepair, reload);
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [ack, setAck] = useState<string | null>(null);

  const contact = useMemo(() => (repair ? resolveRepairContact(repair) : null), [repair]);
  const statusEntry = repair ? currentStatusEntry(repair) : null;

  const handleSave = useCallback(
    async (draft: RepairInfoDraft) => {
      setEditError(null);
      const result = await save(draft);
      if (result.error) {
        setEditError(result.error);
        return;
      }
      if (result.saved.length) setAck(`Saved — ${result.saved.join(', ')}`);
      setEditOpen(false);
    },
    [save],
  );

  return (
    <ModeRegion mode="triage" className="flex min-h-screen flex-col bg-mode-panel">
      <MobileDetailTopBar
        backHref={`/m/rs/${repairId}`}
        subtitle="Details"
        title={`RS-${repairId}`}
        mono
        right={
          repair ? (
            <IconButton
              ariaLabel="Edit details"
              onClick={() => {
                setEditError(null);
                setEditOpen(true);
              }}
              icon={<Pencil className="h-5 w-5" />}
              className="flex h-11 w-11 items-center justify-center text-mode-ink"
            />
          ) : null
        }
      />

      <div className="flex-1 space-y-4 px-mode-page py-mode-page">
        {loading && <p className="py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>}
        {error && (
          <div className="rounded-mode border border-rose-200 bg-rose-50 p-mode-page text-mode-body font-semibold text-rose-700">
            {error}
          </div>
        )}

        {ack ? <DetailAck onDismiss={() => setAck(null)}>{ack}</DetailAck> : null}

        {repair ? (
          <Panel radius="none" padding="none" elevation="none" className="rounded-mode">
            <DetailFactRow
              label="Status"
              value={
                repair.status ? (
                  <span
                    className={`inline-block rounded-mode border px-2 py-0.5 text-role-caption font-semibold ${repairStatusBadgeClass(repair.status)}`}
                  >
                    {repairStatusOperatorLabel(repair.status)}
                  </span>
                ) : (
                  <span className="text-text-faint">Not set</span>
                )
              }
              hint={statusEntry ? `since ${formatMonthDayTimePST(statusEntry.timestamp)}` : undefined}
            />
            <DetailFactRow label="Device" value={repair.product_title || '—'} />
            <DetailFactRow label="Issue" value={repair.issue || '—'} />
            <DetailFactRow
              label="Serial"
              value={repair.serial_number ? <span className="font-mono">{repair.serial_number}</span> : '—'}
            />
            <DetailFactRow label="Customer" value={contact?.name || '—'} />
            {contact?.phone ? <DetailFactRow label="Phone" value={contact.phone} /> : null}
            {contact?.email ? <DetailFactRow label="Email" value={<span className="break-all">{contact.email}</span>} /> : null}
            <DetailFactRow label="Price" value={repair.price || '—'} />
            <DetailFactRow label="Notes" value={repair.notes || '—'} />
          </Panel>
        ) : null}
      </div>

      {repair ? (
        <RepairInfoEditSheet
          open={editOpen}
          repairId={repair.id}
          repair={repair}
          saving={saving}
          error={editError}
          onSave={(draft) => void handleSave(draft)}
          onClose={() => setEditOpen(false)}
        />
      ) : null}
    </ModeRegion>
  );
}

export default function RepairInfoPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <RepairInfoInner />
    </Suspense>
  );
}
