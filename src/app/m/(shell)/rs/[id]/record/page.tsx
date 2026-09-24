'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { DetailFactRow, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { useRepairRecord, useRepairTicketLink } from '@/components/mobile/repair/useRepairWorkbench';
import { repairStatusOperatorLabel } from '@/lib/repair-status';
import { pickupEntry } from '@/lib/repair/repair-history';
import type { RepairTicketLink } from '@/lib/repair/ticket-link';
import { formatMonthDayTimePST } from '@/utils/date';
import { Panel } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

function ticketLinkFace(link: RepairTicketLink | null): string {
  if (!link) return 'Checking…';
  switch (link.state) {
    case 'linked':
      return `Zendesk #${link.zendeskTicketId}`;
    case 'ambiguous':
      return `Ambiguous — ${link.zendeskTicketIds.map((id) => `#${id}`).join(', ')}`;
    case 'internal':
      return `Internal ticket ${link.supportTicketId}`;
    case 'unverified':
      return `Not linked (typed ${link.ticketNumber})`;
    default:
      return 'None linked';
  }
}

/**
 * `/m/rs/[id]/record` — the read-mostly record: identifiers, pickup audit and
 * the server-stamped state history. Nothing here writes.
 */
function RepairRecordInner() {
  const params = useParams<{ id: string }>();
  const repairId = Number(params?.id);
  const { repair, error, loading } = useRepairRecord(repairId);
  const { link } = useRepairTicketLink(repairId);
  const rsCode = `RS-${repairId}`;
  const pickup = repair ? pickupEntry(repair) : null;
  const history = [...(repair?.status_history ?? [])].reverse();

  return (
    <ModeRegion mode="triage" className="flex min-h-screen flex-col bg-mode-panel">
      <MobileDetailTopBar backHref={`/m/rs/${repairId}`} subtitle="Record" title={rsCode} mono />

      <div className="flex-1 space-y-5 px-mode-page py-mode-page">
        {loading && <p className="py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>}
        {error && (
          <div className="rounded-mode border border-rose-200 bg-rose-50 p-mode-page text-mode-body font-semibold text-rose-700">
            {error}
          </div>
        )}

        {repair ? (
          <>
            <section className="space-y-2">
              <DetailSectionHeading>Identifiers</DetailSectionHeading>
              <Panel radius="none" padding="none" elevation="none" className="rounded-mode">
                <DetailFactRow label="Repair" value={<span className="font-mono">{rsCode}</span>} />
                <DetailFactRow label="Support ticket" value={ticketLinkFace(link)} />
                {repair.ticket_number ? (
                  <DetailFactRow label="Ticket # field" value={<span className="font-mono">{repair.ticket_number}</span>} />
                ) : null}
                {repair.source_sku ? (
                  <DetailFactRow label="Source SKU" value={<span className="font-mono">{repair.source_sku}</span>} />
                ) : null}
                {repair.source_order_id ? (
                  <DetailFactRow label="Source order" value={<span className="font-mono">{repair.source_order_id}</span>} />
                ) : null}
                {repair.source_tracking_number ? (
                  <DetailFactRow
                    label="Inbound tracking"
                    value={<span className="break-all font-mono">{repair.source_tracking_number}</span>}
                  />
                ) : null}
                <DetailFactRow
                  label="Price"
                  value={<span className="font-semibold text-emerald-600">${repair.price || '0'}</span>}
                />
                <DetailFactRow label="Intake" value={formatMonthDayTimePST(repair.created_at)} />
                {repair.notes ? <DetailFactRow label="Customer notes" value={repair.notes} /> : null}
              </Panel>
            </section>

            <section className="space-y-2">
              <DetailSectionHeading>Pickup</DetailSectionHeading>
              <div className="rounded-mode border border-mode-edge bg-mode-panel p-mode-page">
                {pickup ? (
                  <div className="space-y-1 text-mode-body text-mode-ink">
                    <p>
                      {pickup.metadata?.has_signature === true
                        ? 'Signed'
                        : typeof pickup.metadata?.declined_reason === 'string'
                          ? `Signature declined — ${pickup.metadata.declined_reason}`
                          : 'Recorded without signature'}{' '}
                      · {formatMonthDayTimePST(pickup.timestamp)}
                    </p>
                    <a
                      className="text-role-caption font-semibold underline"
                      href={`/api/repair-service/print/${repair.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open pickup receipt
                    </a>
                  </div>
                ) : (
                  <p className="text-role-caption text-mode-muted">Not picked up yet.</p>
                )}
              </div>
            </section>

            <section className="space-y-2">
              <DetailSectionHeading>State history</DetailSectionHeading>
              <div className="rounded-mode border border-mode-edge bg-mode-panel p-mode-page">
                {history.length === 0 ? (
                  <p className="text-role-caption text-mode-muted">No status changes recorded.</p>
                ) : (
                  <ol className="space-y-2">
                    {history.map((entry, index) => (
                      <li key={`${entry.timestamp}-${index}`} className="flex items-baseline justify-between gap-3">
                        <span className="text-mode-body font-semibold text-mode-ink">
                          {repairStatusOperatorLabel(entry.status)}
                          {entry.user_name ? (
                            <span className="ml-1.5 text-role-caption font-normal text-mode-muted">{entry.user_name}</span>
                          ) : null}
                        </span>
                        <time className="shrink-0 text-role-caption text-mode-muted">
                          {formatMonthDayTimePST(entry.timestamp)}
                        </time>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </ModeRegion>
  );
}

export default function RepairRecordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <RepairRecordInner />
    </Suspense>
  );
}
