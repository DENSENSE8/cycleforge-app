'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { DetailFact, DetailFacts, DetailSectionHeading } from '@/components/mobile/detail/DetailParts';
import { useRepairRecord, useRepairTicketLink } from '@/components/mobile/repair/useRepairWorkbench';
import { repairStatusOperatorLabel } from '@/lib/repair-status';
import { pickupEntry } from '@/lib/repair/repair-history';
import type { RepairTicketLink } from '@/lib/repair/ticket-link';
import { formatMonthDayTimePST } from '@/utils/date';

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
    <div className="flex min-h-screen flex-col bg-mode-panel">
      <MobileDetailTopBar backHref={`/m/rs/${repairId}`} subtitle="Record" title={rsCode} mono />

      <div className="flex-1 divide-y divide-mode-rule">
        {loading && <p className="px-mode-page py-10 text-center text-sm font-semibold text-text-soft">Loading…</p>}
        {error && <div className="bg-rose-50 px-mode-page py-3 text-mode-body font-semibold text-rose-700">{error}</div>}

        {repair ? (
          <>
            <section className="divide-y divide-mode-rule">
              <DetailSectionHeading>Identifiers</DetailSectionHeading>
              <DetailFacts label="Identifiers">
                <DetailFact label="Repair" value={rsCode} mono copy={rsCode} />
                <DetailFact label="Intake" value={formatMonthDayTimePST(repair.created_at)} />
                <DetailFact label="Support ticket" value={ticketLinkFace(link)} />
                {repair.ticket_number ? (
                  <DetailFact label="Ticket # field" value={repair.ticket_number} mono copy={repair.ticket_number} />
                ) : null}
                {repair.source_sku ? (
                  <DetailFact label="Source SKU" value={repair.source_sku} mono copy={repair.source_sku} />
                ) : null}
                {repair.source_order_id ? (
                  <DetailFact label="Source order" value={repair.source_order_id} mono copy={repair.source_order_id} />
                ) : null}
                {repair.source_tracking_number ? (
                  <DetailFact
                    label="Inbound tracking"
                    value={repair.source_tracking_number}
                    mono
                    copy={repair.source_tracking_number}
                  />
                ) : null}
                <DetailFact label="Price" value={<span className="text-emerald-600">${repair.price || '0'}</span>} />
                {repair.notes ? <DetailFact label="Customer notes" value={repair.notes} /> : null}
              </DetailFacts>
            </section>

            <section className="divide-y divide-mode-rule">
              <DetailSectionHeading>Pickup</DetailSectionHeading>
              <div className="bg-mode-panel px-mode-page py-3">
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

            <section className="divide-y divide-mode-rule">
              <DetailSectionHeading>State history</DetailSectionHeading>
              {history.length === 0 ? (
                <p className="bg-mode-panel px-mode-page py-3 text-role-caption text-mode-muted">
                  No status changes recorded.
                </p>
              ) : (
                <ol className="divide-y divide-mode-rule bg-mode-panel">
                  {history.map((entry, index) => (
                    <li
                      key={`${entry.timestamp}-${index}`}
                      className="flex items-baseline justify-between gap-3 px-mode-page py-2.5"
                    >
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
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function RepairRecordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-card" />}>
      <RepairRecordInner />
    </Suspense>
  );
}
