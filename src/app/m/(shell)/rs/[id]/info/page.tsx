'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { DetailAck, DetailFact, DetailFacts } from '@/components/mobile/detail/DetailParts';
import { RepairInfoEditSheet } from '@/components/mobile/repair/RepairInfoEditSheet';
import { useRepairInfoSave } from '@/components/mobile/repair/useRepairInfoSave';
import { useRepairRecord } from '@/components/mobile/repair/useRepairWorkbench';
import { repairStatusBadgeClass, repairStatusOperatorLabel } from '@/lib/repair-status';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import { currentStatusEntry } from '@/lib/repair/repair-history';
import type { RepairInfoDraft } from '@/lib/repair/repair-info-edit';
import { formatMonthDayTimePST } from '@/utils/date';
import { IconButton } from '@/design-system/primitives';
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

      <div className="flex-1 divide-y divide-mode-rule">
        {loading && <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>}
        {error && (
          <div className="bg-rose-50 px-mode-page py-3 text-mode-body font-semibold text-rose-700">{error}</div>
        )}

        {ack ? <DetailAck onDismiss={() => setAck(null)}>{ack}</DetailAck> : null}

        {repair ? (
          <DetailFacts>
            <DetailFact label="Device" value={repair.product_title || null} />
            <DetailFact label="Issue" value={repair.issue || null} />
            <DetailFact
              label="Status"
              value={
                repair.status ? (
                  <span
                    className={`inline-block border px-2 py-0.5 text-role-caption font-semibold ${repairStatusBadgeClass(repair.status)}`}
                  >
                    {repairStatusOperatorLabel(repair.status)}
                  </span>
                ) : (
                  <span className="text-mode-muted">Not set</span>
                )
              }
              hint={statusEntry ? `since ${formatMonthDayTimePST(statusEntry.timestamp)}` : undefined}
            />
            <DetailFact label="Serial" value={repair.serial_number || null} mono copy={repair.serial_number} />
            <DetailFact label="Customer" value={contact?.name || null} />
            {contact?.phone ? <DetailFact label="Phone" value={contact.phone} /> : null}
            <DetailFact label="Price" value={repair.price || null} />
            {contact?.email ? (
              <DetailFact label="Email" value={<span className="break-all">{contact.email}</span>} />
            ) : null}
            <DetailFact label="Notes" value={repair.notes || null} />
          </DetailFacts>
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
