'use client';

/** History DETAIL — one past record, read the way a point-of-sale reads one. */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { KioskChip } from '@/components/kiosk/KioskChip';
import { KioskSerialListField } from '@/components/kiosk/KioskSerialListField';
import {
  Barcode,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  MoreVertical,
  Printer,
} from '@/components/Icons';
import { repairStorefrontUrl } from '@/lib/repair/repair-storefront-url';
import { parseRepairChannel } from '@/lib/repair/repair-channel';
import { visitLineAdjustmentText, visitMoneyEvents } from '@/lib/counter/visit-line-adjustment';
import { SignatureStrokesView } from '@/components/repair/SignatureStrokesView';
import { buildRepairLabelPayload, printRepairLabel } from '@/lib/print/printRepairLabel';
import { toast } from '@/lib/toast';
import { KIOSK_SECTION_LABEL_ROW } from '@/app/kiosk/kiosk-chrome';
import { KIOSK_POS_CTA, KIOSK_POS_CTA_SECONDARY } from '@/app/kiosk/kiosk-pos-surface';
import { ACTION_DOCK_LIFT, ACTION_DOCK_TOP_GAP } from '@/design-system/tokens/dock-clearance';
import { useAddLinkedRepair } from '@/components/kiosk/KioskLinkRepair';
import { linkableRepairFromHistory } from '@/lib/kiosk/linked-repair-line';
import type {
  KioskVisitDetail,
  KioskVisitEditInput,
  VisitRepairProvenance,
} from '@/lib/kiosk/history/kiosk-history-client';
import { kioskHistoryStamp } from './kiosk-history-stamp';
import { kioskHistoryStatusTone } from './kiosk-history-status';
import { cn } from '@/utils/_cn';
import { sentenceCaseLabel } from '@/lib/text/sentence-case-label';

/**
 * The phone handoff code. Loaded on demand and never on the server — the
 * counter face is already the heaviest client bundle on the tablet, and a QR
 * renderer is dead weight on every OTHER kiosk command.
 */
const QRCode = dynamic(() => import('react-qr-code'), {
  ssr: false,
  loading: () => <div className="h-[84px] w-[84px] animate-pulse rounded bg-surface-sunken" />,
});

/** Scan the record onto the phone in your hand. */
function PhoneQr({ repairId, label }: { repairId: number; label: string }) {
  const [href, setHref] = useState<string | null>(null);
  useEffect(() => {
    setHref(`${window.location.origin}/m/rs/${repairId}`);
  }, [repairId]);
  return (
    <div className="flex shrink-0 flex-col items-center gap-1" data-testid="kiosk-history-qr">
      <div className="rounded bg-white p-1.5" aria-hidden>
        {href ? <QRCode value={href} size={84} level="M" /> : null}
      </div>
      <span className="text-role-caption text-text-soft">Scan for phone</span>
      <span className="sr-only">{`Scan to open ${label} on your phone`}</span>
    </div>
  );
}

/**
 * Money, or an em dash. Null is "not quoted" — printing `$0.00` there claims
 * the shop agreed to do the repair for nothing, which is a different fact and
 * one nobody recorded.
 */
function formatCents(cents: number | null | undefined): string {
  if (cents == null) return '—';
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** The RECEIPT MEASURE — how wide one record is allowed to be. */
const RECEIPT_MEASURE = 'mx-auto w-full max-w-[34rem]';

/** One width for every text key in the action bar, and one square for the overflow. */
const ACTION_KEY = 'w-44 max-w-none';
const ACTION_OVERFLOW = 'w-12 max-w-none px-0';

/** Who did the work, and how sure we are — never "assigned" dressed as "did". */
const TECHNICIAN_PREFIX: Record<NonNullable<VisitRepairProvenance['technicianSource']>, string> = {
  repair_completed: 'Repaired by',
  repair_started: 'Started by',
  bench_action: 'Last touched by',
  assignment: 'Assigned to',
};

/** One fact, label STACKED over value — never label-left / value-right. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-role-caption text-text-soft">{label}</dt>
      <dd className="mt-0.5 break-words text-role-body font-medium text-text-default">{value}</dd>
    </div>
  );
}

/** Two stacked pairs per row — Polaris' order-card grid, at tablet measure. */
function FactGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3">{children}</dl>;
}

/** One line of the money roll-up — the ONE place a left/right pair is right, because the column of figures is the thing being compared. */
function MoneyRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-6 py-1',
        strong && 'mt-1 border-t border-border-soft pt-2.5',
      )}
    >
      <span
        className={cn(
          strong
            ? 'text-role-title text-text-default'
            : 'text-role-body text-text-soft',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums',
          strong ? 'text-role-title text-text-default' : 'text-role-body text-text-default',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SignatureFace({
  title,
  url,
  strokes,
  signedAt,
}: {
  title: string;
  url: string | null;
  strokes: unknown | null;
  signedAt: string | null;
}) {
  const hasStrokes = Array.isArray(strokes) && strokes.length > 0;
  const signed = Boolean(url) || hasStrokes;
  return (
    <div className="py-2">
      <p className="text-role-caption text-text-soft">{title}</p>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a Blob signature PNG, not a product image
        <img src={url} alt={title} className="mt-1 h-16 w-auto max-w-full object-contain" />
      ) : hasStrokes ? (
        <SignatureStrokesView strokes={strokes} label={title} className="mt-1 h-16 w-auto" />
      ) : (
        <p className="mt-1 text-role-body text-text-soft">Not signed</p>
      )}
      {/* WHEN it was gathered — a signature with no instant proves the customer agreed, but not to which version of the ticket. */}
      {signed ? (
        <p className="mt-1 text-role-caption tabular-nums text-text-soft">
          {signedAt ? kioskHistoryStamp(signedAt) : 'Signed — no timestamp recorded'}
        </p>
      ) : null}
    </div>
  );
}

interface DeviceDraft {
  serialNumber: string;
  issue: string;
  notes: string;
}

function draftFromProvenance(provenance: VisitRepairProvenance[]): Record<number, DeviceDraft> {
  const next: Record<number, DeviceDraft> = {};
  for (const device of provenance) {
    next[device.repairId] = {
      serialNumber: device.serialNumber ?? '',
      issue: device.issue ?? '',
      notes: device.notes ?? '',
    };
  }
  return next;
}

async function copyToClipboard(value: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast(`${what} copied.`);
  } catch {
    toast(`Could not copy the ${what.toLowerCase()}.`);
  }
}

export function KioskHistoryDetail({
  detail,
  loading,
  error,
  busy,
  onPrintReceipt,
  onPrintPaperwork,
  onPrintLabel,
  onSave,
}: {
  detail: KioskVisitDetail | null;
  loading: boolean;
  error: string | null;
  /** True while a print stamp or a save is in flight. */
  busy: boolean;
  /** Visit only — a ticket with no transaction has no receipt to render. */
  onPrintReceipt: (staffCopy: boolean) => void;
  /** The repair's own letterhead form, for either book. */
  onPrintPaperwork: (repairId: number) => void;
  onPrintLabel: (repairId: number) => void;
  onSave: (edit: KioskVisitEditInput) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [customerDraft, setCustomerDraft] = useState({ name: '', phone: '', email: '' });
  const [deviceDrafts, setDeviceDrafts] = useState<Record<number, DeviceDraft>>({});
  // A standalone ticket can join the live cart as a linked line — the same
  // helper the cart's own `Link existing repair` search uses.
  const addLinked = useAddLinkedRepair();

  // A new record on screen cancels any half-typed edit of the previous one —
  // saving a draft against a different visit is the worst bug this face could
  // ship.
  useEffect(() => {
    setEditing(false);
  }, [detail?.visit?.id, detail?.repair?.repairId]);

  const resetDrafts = useCallback((source: KioskVisitDetail) => {
    setCustomerDraft({
      name: source.visit?.customer?.name ?? '',
      phone: source.visit?.customer?.phone ?? '',
      email: source.visit?.customer?.email ?? '',
    });
    setDeviceDrafts(draftFromProvenance(source.provenance));
  }, []);

  const lines = useMemo(
    () => detail?.visit?.lines.filter((line) => line.voidedAt === null) ?? [],
    [detail],
  );
  const moneyEvents = useMemo(
    () => visitMoneyEvents(detail?.visit?.auditTrail ?? []),
    [detail],
  );

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center gap-2 px-6">
        <Loader2 className="h-5 w-5 animate-spin text-text-soft" aria-hidden />
        <span className="text-role-body text-text-soft">Loading record…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <p className="text-role-body font-semibold text-text-danger">{error}</p>
      </div>
    );
  }

  /** This is no longer "select a record" — the pane auto-opens the newest row and re-points on every result set, so a null detail can only… */
  if (!detail) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <p className="text-role-body text-text-soft" data-testid="kiosk-history-detail-empty">
          No records to open.
        </p>
      </div>
    );
  }

  const { visit, repair, provenance } = detail;
  // The customer is the visit's when there is a transaction, and the ticket's
  // own contact otherwise — a repair checked in from an Ecwid order or an
  // inbound shipment still knows whose radio it is.
  const customer = visit?.customer ?? repair?.customer ?? null;
  const square = visit?.payment.squareTransaction ?? null;

  const title = visit
    ? provenance[0]?.rsNumber || `Visit #${visit.id}`
    : (repair?.ticketNumber ?? '');
  const takenAt = visit?.createdAt ?? repair?.createdAt ?? null;
  const amountCents = visit ? visit.totalCents : (repair?.priceCents ?? null);
  // A transaction's number is what was RUNG UP; a bare ticket's is a QUOTE that
  // nobody has taken money for. Saying "Total" over both would be a lie on one.
  const amountCaption = visit ? 'Total' : 'Quoted';
  const soleDevice = provenance.length === 1 ? provenance[0] : null;
  // The intake chip, in the counter's words: a drop-off is the counter's default, so only a mail-in wears one.
  const intakeLabel = parseRepairChannel(repair?.intakeChannel) === 'shipment' ? 'Mail-in' : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="kiosk-history-detail">
      <header className="shrink-0 border-b border-border-soft px-4 py-3">
        <div className={RECEIPT_MEASURE}>
          {/* HIERARCHY. The top line answers "which record am I looking at" — the ticket on the left, WHEN it happened on the right, because those… */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-role-display text-text-default tabular-nums">
                {title}
              </h2>
              <p className="mt-0.5 flex items-baseline gap-1.5 text-role-caption">
                <span
                  className={cn(
                    'font-semibold tabular-nums',
                    amountCents == null ? 'text-text-soft' : 'text-text-success',
                  )}
                >
                  {formatCents(amountCents)}
                </span>
                <span className="text-text-soft">{amountCaption}</span>
                {visit?.claimedByStaffName ? (
                  <span className="truncate text-text-soft">· {visit.claimedByStaffName}</span>
                ) : null}
              </p>
            </div>
            <p className="shrink-0 text-role-caption tabular-nums text-text-soft">
              {kioskHistoryStamp(takenAt)}
            </p>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5" data-testid="kiosk-history-chips">
          {visit ? <KioskChip tone={kioskHistoryStatusTone(visit.status)}>{visit.status}</KioskChip> : null}
          {provenance.map((device) =>
            device.status ? (
              <KioskChip key={device.repairId} tone={kioskHistoryStatusTone(device.status)}>
                {device.status}
              </KioskChip>
            ) : null,
          )}
          {intakeLabel ? <KioskChip tone="accent">{intakeLabel}</KioskChip> : null}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {/* The itemization, then what it rolls up to — Square's order. */}
        <section className={RECEIPT_MEASURE}>
          <h3 className={cn(KIOSK_SECTION_LABEL_ROW, 'px-0')}>Items</h3>
          {lines.map((line) => (
            <div
              key={line.id}
              className="flex items-start justify-between gap-6 py-2"
              data-testid="kiosk-history-line"
            >
              <div className="min-w-0 flex-1">
                <p className="text-role-body font-semibold text-text-default">
                  {line.title || sentenceCaseLabel(line.type)}
                </p>
                <p className="text-role-caption text-text-soft">
                  {sentenceCaseLabel(line.type)} · ×{line.quantity}
                </p>
                {line.adjustment ? (
                  <p className="text-role-caption text-text-soft" data-testid="kiosk-history-line-adjustment">
                    {visitLineAdjustmentText(line.adjustment)}
                    {line.adjustment.staffName ? ` · ${line.adjustment.staffName}` : ''}
                  </p>
                ) : null}
                {line.note ? (
                  <p className="text-role-caption italic text-text-soft" data-testid="kiosk-history-line-note">
                    {line.note}
                  </p>
                ) : null}
              </div>
              <span className="shrink-0 text-role-body tabular-nums text-text-default">
                {formatCents(line.unitAmountCents * Math.max(1, line.quantity))}
              </span>
            </div>
          ))}

          {provenance.map((device) => {
            // Full reversibility, on the line it belongs to (operator 2026-09-23:
            const storefrontHref = repairStorefrontUrl(device.sourceSku);
            return (
              <div
                key={`quote-${device.repairId}`}
                className="flex items-start justify-between gap-6 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-role-body font-semibold text-text-default">
                    {device.productTitle || 'Repair'}
                  </p>
                  <p className="flex items-center gap-1 text-role-caption text-text-soft">
                    <span className="truncate">
                      Repair service
                      {device.sourceSku ? ` · ${device.sourceSku}` : ''}
                    </span>
                    {storefrontHref ? (
                      <IconButton
                        icon={<ExternalLink className="h-3.5 w-3.5" />}
                        tone="accent"
                        ariaLabel={`Open the storefront listing for ${device.sourceSku ?? 'this repair'} in a new tab`}
                        onClick={() =>
                          window.open(storefrontHref, '_blank', 'noopener,noreferrer')
                        }
                        className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded hover:bg-surface-sunken"
                      />
                    ) : null}
                  </p>
                </div>
                <span className="shrink-0 text-role-body tabular-nums text-text-default">
                  {formatCents(
                    visit?.devices.find((d) => d.id === device.repairId)?.quoteCents ??
                      (visit ? 0 : (repair?.priceCents ?? null)),
                  )}
                </span>
              </div>
            );
          })}

          {/* Same width as the itemization above it. A narrower totals block
              reads as a different table and breaks the column the figures are
              meant to be compared down. */}
          <div className="pb-4 pt-2">
            {visit ? (
              <>
                {/* `subtotalCents` is the SALES subtotal — the counter models device quotes as their own summand, and a bare "Subtotal $24.00" under a… */}
                {lines.length > 0 ? (
                  <MoneyRow label="Sales" value={formatCents(visit.subtotalCents)} />
                ) : null}
                {visit.devices.length > 0 ? (
                  <MoneyRow
                    label={visit.devices.length === 1 ? 'Repair' : 'Repairs'}
                    value={formatCents(
                      visit.devices.reduce((sum, device) => sum + device.quoteCents, 0),
                    )}
                  />
                ) : null}
                {square?.taxCents ? (
                  <MoneyRow label="Tax" value={formatCents(square.taxCents)} />
                ) : null}
                {square?.discountCents ? (
                  <MoneyRow label="Discount" value={formatCents(-square.discountCents)} />
                ) : null}
                <MoneyRow label="Total" value={formatCents(visit.totalCents)} strong />
                <MoneyRow
                  label="Tender"
                  // `staged` is the honest word: the kiosk stages a Square order
                  // and never charges a card, so "Paid" here would be invented.
                  value={
                    square?.paymentMethod ??
                    (visit.status === 'paid' ? 'Paid' : 'Staged — not charged')
                  }
                />
              </>
            ) : (
              <>
                <MoneyRow label="Quoted" value={formatCents(repair?.priceCents ?? null)} strong />
                <MoneyRow label="Tender" value="No transaction on this ticket" />
              </>
            )}
          </div>
        </section>

        {moneyEvents.length > 0 ? (
          /* Square's comp & void report, for this visit: every price change,
             comp and void, with the reason and whose PIN authorized it. A
             void never prints on the receipt — this is where it is recorded. */
          <section className={RECEIPT_MEASURE} data-testid="kiosk-history-money-events">
            <h3 className={cn(KIOSK_SECTION_LABEL_ROW, 'px-0')}>Adjustments</h3>
            {moneyEvents.map((event) => (
              <div key={event.id} className="flex items-start justify-between gap-6 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-role-body font-semibold text-text-default">
                    {event.label}
                    {event.lineTitle ? ` · ${event.lineTitle}` : ''}
                  </p>
                  <p className="text-role-caption text-text-soft">
                    {[event.reason, event.staffName].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <span className="shrink-0 text-role-caption tabular-nums text-text-soft">
                  {kioskHistoryStamp(event.at)}
                </span>
              </div>
            ))}
          </section>
        ) : null}

        <section className={RECEIPT_MEASURE}>
          <h3 className={cn(KIOSK_SECTION_LABEL_ROW, 'px-0')}>Customer</h3>
          {editing ? (
            <div className="space-y-3 py-3">
              <TextField
                label="Name"
                value={customerDraft.name}
                onChange={(name) => setCustomerDraft((d) => ({ ...d, name }))}
                inputClassName="rounded-none"
                data-testid="kiosk-history-edit-name"
              />
              <TextField
                label="Phone"
                value={customerDraft.phone}
                onChange={(phone) => setCustomerDraft((d) => ({ ...d, phone }))}
                inputClassName="rounded-none"
                data-testid="kiosk-history-edit-phone"
              />
              <TextField
                label="Email"
                value={customerDraft.email}
                onChange={(email) => setCustomerDraft((d) => ({ ...d, email }))}
                inputClassName="rounded-none"
                data-testid="kiosk-history-edit-email"
              />
            </div>
          ) : (
            <FactGrid>
              {/* NEVER "Walk-in". */}
              <Fact label="Name" value={customer?.name ?? '—'} />
              <Fact label="Phone" value={customer?.phone ?? '—'} />
              <Fact label="Email" value={customer?.email ?? '—'} />
            </FactGrid>
          )}
        </section>

        {provenance.map((device) => {
          const draft = deviceDrafts[device.repairId];
          const technician =
            device.technicianSource && device.technicianName
              ? `${TECHNICIAN_PREFIX[device.technicianSource]} ${device.technicianName}`
              : 'No technician recorded';
          const rsNumber = device.rsNumber || `RS-${device.repairId}`;
          /**
           * THE TICKET NUMBER IS PRINTED ONCE (operator 2026-09-23).
           * THE TICKET NUMBER IS PRINTED ONCE (operator 2026-09-23). It is the
           */
          const repeatsHeader = provenance.length === 1 && rsNumber === title;
          return (
            <section key={device.repairId} className={RECEIPT_MEASURE} data-testid="kiosk-history-device">
              <h3 className={cn(KIOSK_SECTION_LABEL_ROW, 'px-0')}>
                {repeatsHeader ? 'Device' : rsNumber}
              </h3>
              <div className="flex items-start justify-between gap-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-role-title text-text-default">
                    {device.productTitle || 'Device'}
                  </p>
                  <p className="text-role-caption text-text-soft">{technician}</p>
                </div>
                {/* The status chip lives ONCE, in the header band. Repeating it
                    here put `Incoming Shipment` on screen twice, two hand-spans
                    apart, saying nothing new the second time. */}
                {/* One code PER DEVICE, for the same reason the storefront link
                    is: `/m/rs/<id>` names one repair, and a visit with two units
                    has two of them. */}
                <PhoneQr repairId={device.repairId} label={rsNumber} />
              </div>

              {editing && draft ? (
                <div className="space-y-3 py-3">
                  <KioskSerialListField
                    name="Serial number"
                    idScope={`history-${device.repairId}`}
                    value={draft.serialNumber}
                    onChange={(serialNumber) =>
                      setDeviceDrafts((d) => ({
                        ...d,
                        [device.repairId]: { ...d[device.repairId], serialNumber },
                      }))
                    }
                    testId="kiosk-history-edit-serial"
                  />
                  <TextField
                    label="Issue"
                    value={draft.issue}
                    onChange={(issue) =>
                      setDeviceDrafts((d) => ({
                        ...d,
                        [device.repairId]: { ...d[device.repairId], issue },
                      }))
                    }
                    multiline
                    inputClassName="rounded-none"
                    data-testid="kiosk-history-edit-issue"
                  />
                  <TextField
                    label="Notes"
                    value={draft.notes}
                    onChange={(notes) =>
                      setDeviceDrafts((d) => ({
                        ...d,
                        [device.repairId]: { ...d[device.repairId], notes },
                      }))
                    }
                    multiline
                    inputClassName="rounded-none"
                    data-testid="kiosk-history-edit-notes"
                  />
                </div>
              ) : (
                <FactGrid>
                  <Fact label="Serial" value={device.serialNumber || '—'} />
                  <Fact label="Dropped off" value={kioskHistoryStamp(device.receivedAt)} />
                  <Fact
                    label="Picked up"
                    value={
                      device.deliveredAt || device.pickupSignedAt
                        ? kioskHistoryStamp(device.deliveredAt ?? device.pickupSignedAt)
                        : 'Not yet'
                    }
                  />
                  <Fact
                    label="Label printed"
                    value={device.labelPrintedAt ? kioskHistoryStamp(device.labelPrintedAt) : 'Never'}
                  />
                  {device.pickupStaffName ? (
                    <Fact label="Handed over by" value={device.pickupStaffName} />
                  ) : null}
                  {/* The issue is prose, not a datum — it gets the full measure
                      rather than half a grid cell it would wrap five times in. */}
                  <div className="col-span-2">
                    <Fact label="Issue" value={device.issue || '—'} />
                  </div>
                </FactGrid>
              )}

              {device.parts.length > 0 ? (
                <ul className="pb-2" data-testid="kiosk-history-parts">
                  {device.parts.map((part, index) => (
                    <li
                      key={`${part.description}-${index}`}
                      className="flex items-baseline justify-between gap-6 py-1"
                    >
                      <span className="min-w-0 flex-1 truncate text-role-body text-text-default">
                        {part.description}
                        {part.sku ? (
                          <span className="ml-2 font-mono text-role-caption text-text-soft">
                            {part.sku}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-role-caption text-text-soft">
                        {part.quantity != null ? `×${part.quantity}` : 'used'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* Signatures are their own GROUP, not two loose images at the tail of the facts: */}
              <h3 className={cn(KIOSK_SECTION_LABEL_ROW, 'mt-2 px-0')}>Signatures</h3>
              <div className="grid grid-cols-2 gap-x-6">
                <SignatureFace
                  title="Drop-off"
                  url={device.intakeSignatureUrl}
                  strokes={device.intakeSignatureStrokes}
                  signedAt={device.intakeSignedAt}
                />
                <SignatureFace
                  title="Pick-up"
                  url={device.pickupSignatureUrl}
                  strokes={device.pickupSignatureStrokes}
                  signedAt={device.pickupSignedAt}
                />
              </div>

              {/* With ONE device the action bar carries its label, so a second
                  button here would be the same act twice. With two or more the
                  bar cannot know which device you meant — so each card does. */}
              {!editing && provenance.length > 1 ? (
                <div className="flex flex-wrap gap-2 pb-3">
                  <Button
                    variant="secondary"
                    size="lg"
                    className={KIOSK_POS_CTA_SECONDARY}
                    icon={<Barcode className="h-4 w-4" aria-hidden />}
                    disabled={busy}
                    onClick={() => {
                      printRepairLabel(
                        buildRepairLabelPayload({
                          repairId: device.repairId,
                          customerName: customer?.name ?? '',
                          ticketNumber: device.rsNumber,
                          intakeAt: device.receivedAt,
                        }),
                      );
                      onPrintLabel(device.repairId);
                    }}
                    data-testid="kiosk-history-print-label"
                  >
                    {device.labelPrintedAt ? 'Reprint label' : 'Print label'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    className={KIOSK_POS_CTA_SECONDARY}
                    icon={<FileText className="h-4 w-4" aria-hidden />}
                    disabled={busy}
                    onClick={() => onPrintPaperwork(device.repairId)}
                    data-testid="kiosk-history-print-paperwork"
                  >
                    Paperwork
                  </Button>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>

      {/* Fixed-width keys, seated in the RECORD's column — floating, no rule above them (owner 2026-10-03). */}
      <div className={cn('shrink-0 px-4', ACTION_DOCK_TOP_GAP, ACTION_DOCK_LIFT)}>
        <div className={cn(RECEIPT_MEASURE, 'flex items-center justify-end gap-2')}>
        {editing ? (
          <>
            <Button
              variant="secondary"
              size="lg"
              className={cn(KIOSK_POS_CTA_SECONDARY, ACTION_KEY)}
              disabled={busy}
              onClick={() => setEditing(false)}
              data-testid="kiosk-history-edit-cancel"
            >
              Cancel
            </Button>
            <Button
              size="lg"
              className={cn(KIOSK_POS_CTA, ACTION_KEY)}
              disabled={busy}
              onClick={() =>
                void onSave({
                  customer: customerDraft,
                  devices: provenance.map((device) => ({
                    repairId: device.repairId,
                    ...deviceDrafts[device.repairId],
                  })),
                }).then(() => setEditing(false))
              }
              data-testid="kiosk-history-edit-save"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Save changes'}
            </Button>
          </>
        ) : (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                {/* Three dots, no word. */}
                <Button
                  variant="secondary"
                  size="lg"
                  className={cn(KIOSK_POS_CTA_SECONDARY, ACTION_OVERFLOW)}
                  disabled={busy}
                  aria-label="More actions"
                  data-testid="kiosk-history-more"
                >
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuLabel>Print</DropdownMenuLabel>
                {visit ? (
                  <DropdownMenuItem
                    onSelect={() => onPrintReceipt(true)}
                    data-testid="kiosk-history-print-staff"
                  >
                    <Printer className="mr-2 h-4 w-4" aria-hidden />
                    Staff copy of receipt
                  </DropdownMenuItem>
                ) : null}
                {provenance.map((device) => (
                  <DropdownMenuItem
                    key={`paper-${device.repairId}`}
                    onSelect={() => onPrintPaperwork(device.repairId)}
                    data-testid="kiosk-history-more-paperwork"
                  >
                    <FileText className="mr-2 h-4 w-4" aria-hidden />
                    {provenance.length > 1
                      ? `Paperwork · ${device.rsNumber || `RS-${device.repairId}`}`
                      : 'Repair paperwork'}
                  </DropdownMenuItem>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Copy</DropdownMenuLabel>
                {title ? (
                  <DropdownMenuItem
                    onSelect={() => void copyToClipboard(title, 'Ticket number')}
                    data-testid="kiosk-history-copy-ticket"
                  >
                    <Copy className="mr-2 h-4 w-4" aria-hidden />
                    Copy ticket number
                  </DropdownMenuItem>
                ) : null}
                {customer?.phone ? (
                  <DropdownMenuItem
                    onSelect={() => void copyToClipboard(customer.phone!, 'Phone number')}
                  >
                    <Copy className="mr-2 h-4 w-4" aria-hidden />
                    Copy phone number
                  </DropdownMenuItem>
                ) : null}
                {soleDevice?.serialNumber ? (
                  <DropdownMenuItem
                    onSelect={() => void copyToClipboard(soleDevice.serialNumber, 'Serial')}
                  >
                    <Copy className="mr-2 h-4 w-4" aria-hidden />
                    Copy serial number
                  </DropdownMenuItem>
                ) : null}

                {visit ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => {
                        resetDrafts(detail);
                        setEditing(true);
                      }}
                      data-testid="kiosk-history-edit"
                    >
                      <Copy className="mr-2 h-4 w-4 opacity-0" aria-hidden />
                      Edit customer &amp; device
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            {!visit && repair ? (
              // Only a STANDALONE ticket: a visit's repair is already on a
              // receipt, and the server refuses to move it onto another.
              <Button
                variant="secondary"
                size="lg"
                className={cn(KIOSK_POS_CTA_SECONDARY, ACTION_KEY)}
                disabled={busy}
                onClick={() => addLinked(linkableRepairFromHistory(repair, soleDevice))}
                data-testid="kiosk-history-add-to-cart"
              >
                Add to cart
              </Button>
            ) : null}

            {soleDevice ? (
              <Button
                variant="secondary"
                size="lg"
                className={cn(KIOSK_POS_CTA_SECONDARY, ACTION_KEY)}
                icon={<Barcode className="h-4 w-4" aria-hidden />}
                disabled={busy}
                onClick={() => {
                  printRepairLabel(
                    buildRepairLabelPayload({
                      repairId: soleDevice.repairId,
                      customerName: customer?.name ?? '',
                      ticketNumber: soleDevice.rsNumber,
                      intakeAt: soleDevice.receivedAt,
                    }),
                  );
                  onPrintLabel(soleDevice.repairId);
                }}
                data-testid="kiosk-history-print-label"
              >
                {soleDevice.labelPrintedAt ? 'Reprint label' : 'Print label'}
              </Button>
            ) : null}

            {visit ? (
              <Button
                size="lg"
                className={cn(KIOSK_POS_CTA, ACTION_KEY)}
                icon={<Printer className="h-4 w-4" aria-hidden />}
                disabled={busy}
                onClick={() => onPrintReceipt(false)}
                data-testid="kiosk-history-print-receipt"
              >
                Print receipt
              </Button>
            ) : soleDevice ? (
              <Button
                size="lg"
                className={cn(KIOSK_POS_CTA, ACTION_KEY)}
                icon={<FileText className="h-4 w-4" aria-hidden />}
                disabled={busy}
                onClick={() => onPrintPaperwork(soleDevice.repairId)}
                data-testid="kiosk-history-print-paperwork"
              >
                Print paperwork
              </Button>
            ) : null}
          </>
        )}
        </div>
      </div>
    </div>
  );
}
