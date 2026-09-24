'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import type { RepairStatusHistoryEntry, RSRecord } from '@/lib/neon/repair-service-queries';
import { RepairActionTimeline } from '@/components/repair/mobile/RepairActionTimeline';
import { AddRepairActionSheet } from '@/components/repair/mobile/AddRepairActionSheet';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { RepairWorkbenchDock, type RepairDockVerb } from '@/components/mobile/repair/RepairWorkbenchDock';
import { RepairStatusSheet } from '@/components/mobile/repair/RepairStatusSheet';
import { RepairPhotoStrip } from '@/components/mobile/repair/RepairPhotoStrip';
import { RepairPickupSheet } from '@/components/mobile/repair/RepairPickupSheet';
import { RepairCustomerUpdate } from '@/components/mobile/repair/RepairCustomerUpdate';
import { useActivityInboxOptional } from '@/contexts/ActivityInboxContext';
import { canStartRepairPickup, repairStatusBadgeClass, repairStatusOperatorLabel } from '@/lib/repair-status';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import {
  actionSuggestsCustomerUpdate,
  repairActionLabel,
  type RepairActionRecord,
} from '@/lib/repair/repair-actions';
import type { RepairTicketLink } from '@/lib/repair/ticket-link';
import { formatMonthDayTimePST } from '@/utils/date';
import { Panel, Button, IconButton } from '@/design-system/primitives';
import { ChevronDown, X } from '@/components/Icons';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

function daysSince(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86_400_000);
  if (d <= 0) return 'today';
  if (d === 1) return '1 day in shop';
  return `${d} days in shop`;
}

/** Latest history entry that put the repair into its CURRENT status — the server stamp for "since when". */
function currentStatusEntry(repair: RSRecord): RepairStatusHistoryEntry | null {
  const history = repair.status_history ?? [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].status === repair.status) return history[i];
  }
  return null;
}

/** The pickup write (`/api/repair-service/pickup`) tags its history entry with a `picked_up_*` action. */
function pickupEntry(repair: RSRecord): RepairStatusHistoryEntry | null {
  const history = repair.status_history ?? [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const action = history[i].metadata?.action;
    if (typeof action === 'string' && action.startsWith('picked_up')) return history[i];
  }
  return null;
}

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

function RepairMobilePageInner() {
  const params = useParams<{ id: string }>();
  const repairId = Number(params?.id);
  const inbox = useActivityInboxOptional();

  const [repair, setRepair] = useState<RSRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sheet, setSheet] = useState<RepairDockVerb | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusAck, setStatusAck] = useState<string | null>(null);
  const [actions, setActions] = useState<RepairActionRecord[]>([]);
  const [savedAction, setSavedAction] = useState<RepairActionRecord | null>(null);
  const [ticketLink, setTicketLink] = useState<RepairTicketLink | null>(null);

  const loadRepair = useCallback(async (): Promise<RSRecord | null> => {
    if (!Number.isFinite(repairId) || repairId <= 0) {
      setError('Invalid repair id');
      setLoading(false);
      return null;
    }
    try {
      const res = await fetch(`/api/repair-service/${repairId}`, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      const body = (await res.json()) as RSRecord;
      setRepair(body);
      setError(null);
      return body;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repair');
      return null;
    } finally {
      setLoading(false);
    }
  }, [repairId]);

  useEffect(() => {
    void loadRepair();
  }, [loadRepair]);

  /**
   * The one status write. Optimistic so the badge moves under the thumb; the
   * previous value comes back on failure. The server appends `status_history`
   * with its own clock, so the acknowledgement reads the refetched stamp, not
   * the phone's.
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
        const fresh = await loadRepair();
        const stamp = fresh ? currentStatusEntry(fresh)?.timestamp : null;
        setStatusAck(
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
    [repair, statusSaving, inbox, loadRepair],
  );

  const openSheet = useCallback((verb: RepairDockVerb) => {
    setStatusError(null);
    setSheet(verb);
  }, []);

  const focusCustomerDraft = useCallback(() => {
    document.getElementById('rs-customer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.getElementById('rs-customer-draft')?.focus({ preventScroll: true });
  }, []);

  const rsCode = `RS-${repairId}`;
  const contact = useMemo(() => (repair ? resolveRepairContact(repair) : null), [repair]);
  const statusEntry = repair ? currentStatusEntry(repair) : null;
  const pickup = repair ? pickupEntry(repair) : null;
  // Customer-draft time: the saved status record first, else the newest saved bench action.
  const eventStamp = statusEntry?.timestamp ?? actions[0]?.created_at ?? null;

  return (
    // Repair is a decide-and-record job: keep its neutral surfaces, shape,
    // spacing, hit floor, and body scale in the cross-platform triage mode.
    // Repair status colour remains semantic and deliberately does not remap.
    <ModeRegion mode="triage" className="flex min-h-screen flex-col bg-mode-canvas">
      {/* Identity only. Every verb lives in the dock. */}
      <MobileDetailTopBar
        title={rsCode}
        mono
        meta={repair ? daysSince(repair.created_at) || undefined : undefined}
      />

      {/*
        One scrolling page, not tabs (operator 2026-09-24). Sections in bench
        order — Photos, Work, Customer, then the read-mostly Record collapsed
        last — so a new section costs a heading, not another tab.
      */}
      <main className="flex-1 space-y-6 px-mode-page py-mode-page">
        {loading && (
          <p className="text-center text-sm font-semibold text-text-soft py-10">Loading…</p>
        )}

        {error && (
          <div className="rounded-mode border border-rose-200 bg-rose-50 p-mode-page text-mode-body font-semibold text-rose-700">
            {error}
          </div>
        )}

        {!loading && repair && (
          <>
            <section aria-labelledby="rs-photos" className="space-y-3">
              <SectionHeading id="rs-photos">Photos</SectionHeading>
              <RepairPhotoStrip repairId={repair.id} />
            </section>

            <section aria-labelledby="rs-work" className="space-y-3">
              <SectionHeading id="rs-work">Work</SectionHeading>
              <Panel radius="none" padding="none" elevation="none" className="rounded-mode">
                <Row
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
                <Row label="Device" value={repair.product_title || 'Bose Repair'} />
                <Row label="Issue" value={repair.issue || '—'} />
                <Row
                  label="Serial"
                  value={
                    repair.serial_number ? (
                      <span className="font-mono">{repair.serial_number}</span>
                    ) : (
                      <span className="text-text-faint">—</span>
                    )
                  }
                />
              </Panel>

              {statusAck ? (
                <Ack onDismiss={() => setStatusAck(null)}>{statusAck}</Ack>
              ) : null}

              {savedAction ? (
                <Ack onDismiss={() => setSavedAction(null)}>
                  <span>
                    Saved — {repairActionLabel(savedAction.action_type)} ·{' '}
                    <time dateTime={savedAction.created_at}>{formatMonthDayTimePST(savedAction.created_at)}</time>
                  </span>
                  {actionSuggestsCustomerUpdate(savedAction.action_type) ? (
                    <Button variant="secondary" size="sm" className="mt-2 rounded-mode" onClick={focusCustomerDraft}>
                      Draft customer update
                    </Button>
                  ) : null}
                </Ack>
              ) : null}

              <RepairActionTimeline
                repairId={repairId}
                refreshKey={refreshKey}
                onLoaded={setActions}
                highlightId={savedAction?.id ?? null}
              />
            </section>

            <section aria-labelledby="rs-customer" className="space-y-3">
              <SectionHeading id="rs-customer">Customer</SectionHeading>
              <Panel radius="none" padding="none" elevation="none" className="rounded-mode">
                <Row label="Name" value={contact?.name || '—'} />
                {contact?.phone ? (
                  <Row label="Phone" value={<a className="underline" href={`tel:${contact.phone}`}>{contact.phone}</a>} />
                ) : null}
                {contact?.email ? (
                  <Row label="Email" value={<span className="break-all">{contact.email}</span>} />
                ) : null}
                {repair.notes && <Row label="Customer notes" value={repair.notes} />}
              </Panel>
              <RepairCustomerUpdate
                repairId={repair.id}
                rsCode={rsCode}
                status={repair.status ?? null}
                customerFirstName={(contact?.name ?? '').trim().split(/\s+/)[0] ?? ''}
                device={repair.product_title ?? ''}
                eventStamp={eventStamp}
                onLinkResolved={setTicketLink}
              />
            </section>

            <section aria-labelledby="rs-record">
              {/* Read-mostly facts: collapsed so they never push Work below the fold. */}
              <details className="group rounded-mode border border-mode-edge bg-mode-panel">
                <summary className="flex min-h-mode-hit cursor-pointer list-none items-center justify-between gap-3 px-mode-page [&::-webkit-details-marker]:hidden">
                  <SectionHeading id="rs-record">Record</SectionHeading>
                  <ChevronDown className="h-5 w-5 shrink-0 text-mode-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-mode-rule">
                  <Row label="Repair" value={<span className="font-mono">{rsCode}</span>} />
                  <Row label="Support ticket" value={ticketLinkFace(ticketLink)} />
                  {repair.ticket_number ? (
                    <Row label="Ticket # field" value={<span className="font-mono">{repair.ticket_number}</span>} />
                  ) : null}
                  {repair.source_sku && (
                    <Row label="Source SKU" value={<span className="font-mono">{repair.source_sku}</span>} />
                  )}
                  {repair.source_order_id ? (
                    <Row label="Source order" value={<span className="font-mono">{repair.source_order_id}</span>} />
                  ) : null}
                  {repair.source_tracking_number ? (
                    <Row
                      label="Inbound tracking"
                      value={<span className="font-mono break-all">{repair.source_tracking_number}</span>}
                    />
                  ) : null}
                  <Row
                    label="Price"
                    value={<span className="text-emerald-600 font-semibold">${repair.price || '0'}</span>}
                  />
                  <Row
                    label="Intake"
                    value={formatMonthDayTimePST(repair.created_at)}
                    hint={daysSince(repair.created_at)}
                  />
                </div>

                <div className="border-t border-mode-rule px-mode-page py-3">
                  <h3 className="text-role-caption font-semibold uppercase tracking-[0.16em] text-mode-muted">Pickup</h3>
                  {pickup ? (
                    <div className="mt-2 space-y-1 text-mode-body text-mode-ink">
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
                    <p className="mt-2 text-role-caption text-mode-muted">Not picked up yet.</p>
                  )}
                </div>

                <div className="border-t border-mode-rule px-mode-page py-3">
                  <h3 className="text-role-caption font-semibold uppercase tracking-[0.16em] text-mode-muted">
                    State history
                  </h3>
                  {(repair.status_history ?? []).length === 0 ? (
                    <p className="mt-2 text-role-caption text-mode-muted">No status changes recorded.</p>
                  ) : (
                    <ol className="mt-2 space-y-2">
                      {[...(repair.status_history ?? [])].reverse().map((entry, index) => (
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
              </details>
            </section>
          </>
        )}
      </main>

      {repair && (
        <RepairWorkbenchDock
          pickupBlockedReason={
            canStartRepairPickup(repair.status) ? null : 'Pickup opens once the repair is complete.'
          }
          onOpen={openSheet}
        />
      )}

      <RepairStatusSheet
        open={sheet === 'status'}
        current={repair?.status ?? null}
        saving={statusSaving}
        error={statusError}
        onSave={(next) => void handleStatusSave(next)}
        onClose={() => setSheet(null)}
      />

      {sheet === 'log' && repair && (
        <AddRepairActionSheet
          repairId={repairId}
          onClose={() => setSheet(null)}
          onSaved={(action) => {
            setSheet(null);
            setSavedAction(action);
            setRefreshKey((k) => k + 1);
            document.getElementById('rs-work')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
      )}

      {repair ? (
        <RepairPickupSheet
          open={sheet === 'pickup'}
          repair={repair}
          onClose={() => setSheet(null)}
          onPicked={() => {
            void loadRepair();
            setRefreshKey((k) => k + 1);
          }}
        />
      ) : null}
    </ModeRegion>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-mode-rule px-mode-page py-2.5 last:border-b-0">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-text-soft shrink-0">
        {label}
      </span>
      <div className="min-w-0 text-right">
        <div className="break-words text-mode-body font-semibold text-text-default">{value}</div>
        {hint ? (
          <p className="mt-0.5 text-xs font-semibold text-text-soft">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

/** Section name on the one-page scroll — one step above the rows it heads. */
function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2
      id={id}
      className="text-role-caption font-semibold uppercase tracking-[0.16em] text-mode-muted"
    >
      {children}
    </h2>
  );
}

/** Quiet save acknowledgement carrying the server's stamp; dismissable, never a modal. */
function Ack({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="flex items-start justify-between gap-3 rounded-mode border border-emerald-200 bg-emerald-50 px-mode-page py-2.5 text-role-caption font-semibold text-emerald-800"
    >
      <div className="flex min-w-0 flex-col items-start">{children}</div>
      <IconButton
        onClick={onDismiss}
        ariaLabel="Dismiss"
        icon={<X className="h-4 w-4" />}
        className="-my-2 -mr-2 flex h-11 w-11 shrink-0 items-center justify-center text-emerald-700"
      />
    </div>
  );
}

export default function RepairMobilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-surface-canvas" />}>
      <RepairMobilePageInner />
    </Suspense>
  );
}
