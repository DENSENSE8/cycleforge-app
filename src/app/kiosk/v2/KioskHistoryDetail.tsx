'use client';

/**
 * History DETAIL — one past record, read the way a point-of-sale reads one.
 *
 * Callers: `KioskHistoryPane`.
 * Affected API: GET `/api/kiosk/visit/[id]`, GET `/api/kiosk/repair/[id]`
 *   (through the pane), GET `/api/kiosk/visit/[id]/receipt`, GET
 *   `/api/kiosk/repair/[id]/paperwork`, POST
 *   `/api/kiosk/visit/[id]/label-printed`, POST
 *   `/api/kiosk/repair/[id]/label-printed`, PATCH `/api/kiosk/visit/[id]`.
 * Data schemas: `CounterVisit` OR `KioskRepairHeader`, plus
 *   `VisitRepairProvenance`.
 * User 2026-09-23: *"the UI is terrible … make it an exact copy of Square Point
 *   of Sale and Shopify Point of Sale. It must have action buttons for printing
 *   out a label if you need to reprint the same label, print out the receipt
 *   paperwork, and more actions as well."*
 *
 * ## The anatomy is Square's, because the question is Square's
 *
 * A POS transaction detail answers four things in a fixed order, and both
 * Square and Shopify order them the same way:
 *
 *   1. **WHAT IS THIS** — identity and money, loud, at the top. Square leads
 *      with the amount in display type and the status beneath it; Shopify leads
 *      with the order name and its badges. This header does both: identity left,
 *      amount right, status chips under them.
 *   2. **WHAT WAS SOLD** — the itemization, then the money it rolls up to:
 *      subtotal, tax, total, then the TENDER. The old pane printed a flat
 *      `Total  $161.00` fact row with no itemization above it, which is the one
 *      thing a counter dispute is always about.
 *   3. **WHO** — the customer block.
 *   4. **WHAT HAPPENED TO IT** — the device cards: status, technician, parts,
 *      both signatures. This is the part a general POS does not have, and it is
 *      why History exists at all.
 *
 * The old pane rendered all four as one undifferentiated `<dl>` stack of
 * label/value rows at the same weight — no hierarchy, no money summary, no
 * status colour, and the actions were three equal grey buttons in a row. That
 * is a debug dump of `CounterVisit`, not a receipt. This is the fix.
 *
 * ## Actions: one primary, one reprint, one overflow
 *
 * Square's detail ends in a fixed action bar and hides everything but the
 * likely act behind **⋯ More**. Same here:
 *
 * - **Primary** — `Print receipt` on a visit, `Print paperwork` on a ticket
 *   that never became one.
 * - **Reprint label** — the 2×1 REP sticker, surfaced whenever there is exactly
 *   one device to aim it at (with two or more, each device card owns its own).
 * - **More** — staff copy, per-device paperwork, edit, and the copy-to-clipboard
 *   verbs an operator reads out over the phone.
 *
 * Every entry is WIRED. An action whose route cannot serve this record's shape
 * is absent, never rendered dead: `Edit` and `Print receipt` post to
 * `/api/kiosk/visit/…` and a standalone ticket has no visit id to aim at.
 *
 * ## The signature rule
 *
 * The Blob PNG is preferred; the stored strokes are the fallback, because
 * `submit-repair-intake.ts` records a signature two ways ON PURPOSE and an
 * upload failure must not read as "the customer never signed". Both faces are
 * labelled with WHICH signature they are — intake and pickup are different
 * promises and a counter dispute turns on which one exists.
 *
 * ## Edit is a mode, not a scatter of inline fields
 *
 * The pane is a record first. Edit opens the same rows as fields, saves once,
 * and every field it offers is one the PATCH route will accept — the tablet
 * never renders an input for something the server answers 403 to.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { Badge } from '@/components/ui/badge';
import {
  Barcode,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  MoreVertical,
  Printer,
} from '@/components/Icons';
import { SkuScanRefChip, SourceOrderChip, TrackingChip } from '@/components/ui/CopyChip';
import { getLast8 } from '@/lib/copy-chip-format';
import { repairStorefrontUrl } from '@/lib/repair/repair-storefront-url';
import { SignatureStrokesView } from '@/components/repair/SignatureStrokesView';
import { buildRepairLabelPayload, printRepairLabel } from '@/lib/print/printRepairLabel';
import { toast } from '@/lib/toast';
import { KIOSK_SECTION_LABEL_ROW } from '@/app/kiosk/kiosk-chrome';
import { KIOSK_POS_CTA, KIOSK_POS_CTA_SECONDARY } from '@/app/kiosk/kiosk-pos-surface';
import type {
  KioskVisitDetail,
  KioskVisitEditInput,
  VisitRepairProvenance,
} from '@/lib/kiosk/history/kiosk-history-client';
import { kioskHistoryStamp } from './kiosk-history-stamp';
import { kioskHistoryStatusTone } from './kiosk-history-status';
import { cn } from '@/utils/_cn';

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

/**
 * The RECEIPT MEASURE — how wide one record is allowed to be.
 *
 * Square's transaction detail is a narrow receipt column centred in the pane,
 * not a full-bleed table, and that is the whole reason its rows are readable at
 * arm's length: an item title and its price are ~30 characters apart, not the
 * width of an iPad. This pane is `md:flex-row` beside a rail, so unconstrained
 * it renders ~750px rows. Everything in the record — header, itemization,
 * facts, device cards — sits inside this one column.
 */
const RECEIPT_MEASURE = 'mx-auto w-full max-w-[34rem]';

/**
 * One width for every text key in the action bar, and one square for the
 * overflow. `max-w-none` is load-bearing: `KIOSK_POS_CTA_SECONDARY` carries
 * `max-w-40`, which would silently clamp the shared width back to 10rem and
 * re-introduce the ragged bar this exists to remove.
 */
const ACTION_KEY = 'w-44 max-w-none';
const ACTION_OVERFLOW = 'w-12 max-w-none px-0';

/** Who did the work, and how sure we are — never "assigned" dressed as "did". */
const TECHNICIAN_PREFIX: Record<NonNullable<VisitRepairProvenance['technicianSource']>, string> = {
  repair_completed: 'Repaired by',
  repair_started: 'Started by',
  bench_action: 'Last touched by',
  assignment: 'Assigned to',
};

/**
 * One fact, label STACKED over value — never label-left / value-right.
 *
 * The label/value row is the thing this pane got wrong: at pane width the
 * label sat at x=0 in 10px condensed and its value at x=750, and the operator's
 * eye had to traverse a quarter-metre of blank counter to pair them. Neither
 * Square nor Shopify does that. Square's transaction detail is a narrow RECEIPT
 * column; Shopify's order card is a grid of stacked pairs (Polaris
 * `DescriptionList`). Both keep the label within a few millimetres of its value,
 * because pairing them is the reading task.
 *
 * So: stacked, left-aligned, two per row ({@link FactGrid}), label at
 * `text-role-caption` — 12px in the normal family, not the 10px condensed
 * `role-micro` this face was using for chrome AND for content.
 */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-role-caption uppercase tracking-wide text-text-soft">{label}</dt>
      <dd className="mt-0.5 break-words text-role-body font-medium text-text-default">{value}</dd>
    </div>
  );
}

/** Two stacked pairs per row — Polaris' order-card grid, at tablet measure. */
function FactGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3">{children}</dl>;
}

/**
 * One line of the money roll-up — the ONE place a left/right pair is right,
 * because the column of figures is the thing being compared. It shares the
 * itemization's width ({@link RECEIPT_MEASURE}), so `$24.00` in the roll-up
 * lands in the same column as the `$24.00` on the line it came from.
 *
 * `strong` is the TOTAL — Square gives it the only rule above it and the only
 * bold weight, so the eye lands there first.
 */
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
      <p className="text-role-caption uppercase tracking-wide text-text-soft">{title}</p>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a Blob signature PNG, not a product image
        <img src={url} alt={title} className="mt-1 h-16 w-auto max-w-full object-contain" />
      ) : hasStrokes ? (
        <SignatureStrokesView strokes={strokes} label={title} className="mt-1 h-16 w-auto" />
      ) : (
        <p className="mt-1 text-role-body text-text-soft">Not signed</p>
      )}
      {/* WHEN it was gathered — a signature with no instant proves the customer
          agreed, but not to which version of the ticket. Said only when there
          IS ink: "no timestamp" under "Not signed" is two ways of saying the
          same nothing. */}
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

  if (!detail) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <p className="text-role-body text-text-soft" data-testid="kiosk-history-detail-empty">
          Select a record to see its paperwork.
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
  /**
   * WHERE IT CAME FROM, whichever spine this record is on.
   *
   * A standalone ticket carries its own source columns; a VISIT-backed repair
   * carries them on its device row. Reading only `repair` meant a drop-off
   * rung up at the counter AND linked to an Ecwid order showed no link back to
   * the storefront — the provenance is a fact about the DEVICE, not about
   * which of the two spines the reader arrived on.
   *
   * `soleDevice` only: with two devices there are two different orders, and a
   * single "Where it came from" block would silently attribute one device's
   * order to both.
   */
  const origin = repair ?? soleDevice;
  // Full reversibility: the ticket's `-RS` SKU is the way back to the listing
  // it was sold from (operator 2026-09-23). `-RS` → `-W` happens in the shared
  // helper, not here, so the desk's link and this one land on the same page.
  const storefrontHref = repairStorefrontUrl(origin?.sourceSku);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="kiosk-history-detail">
      <header className="shrink-0 border-b border-border-soft px-4 py-3">
        <div className={RECEIPT_MEASURE}>
          {/* HIERARCHY. The top line answers "which record am I looking at" —
              the ticket on the left, WHEN it happened on the right, because
              those are the two facts an operator matches against the paper in
              their hand. Money is not an identity: it moved out of the display
              slot (where it out-shouted the ticket) down to the caption line in
              the money token, and the authoritative figure lives in the
              roll-up directly below, where it is beside what it is a sum OF.
              Seconds are dropped — no counter question is answered by `:08`. */}
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
          {visit ? <Badge variant={kioskHistoryStatusTone(visit.status)}>{visit.status}</Badge> : null}
          {provenance.map((device) =>
            device.status ? (
              <Badge key={device.repairId} variant={kioskHistoryStatusTone(device.status)}>
                {device.status}
              </Badge>
            ) : null,
          )}
          {repair?.intakeChannel ? (
            <Badge variant="outline">{repair.intakeChannel}</Badge>
          ) : null}
          {!visit && repair?.sourceSystem ? (
            <Badge variant="outline">{repair.sourceSystem}</Badge>
          ) : null}
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
                  {line.title || line.type}
                </p>
                <p className="text-role-caption text-text-soft">
                  {line.type} · ×{line.quantity}
                </p>
              </div>
              <span className="shrink-0 text-role-body tabular-nums text-text-default">
                {formatCents(line.unitAmountCents * Math.max(1, line.quantity))}
              </span>
            </div>
          ))}

          {provenance.map((device) => (
            <div
              key={`quote-${device.repairId}`}
              className="flex items-start justify-between gap-6 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-role-body font-semibold text-text-default">
                  {device.productTitle || 'Repair'}
                </p>
                <p className="text-role-caption text-text-soft">
                  Repair service · {device.rsNumber || `RS-${device.repairId}`}
                </p>
              </div>
              <span className="shrink-0 text-role-body tabular-nums text-text-default">
                {formatCents(
                  visit?.devices.find((d) => d.id === device.repairId)?.quoteCents ??
                    (visit ? 0 : (repair?.priceCents ?? null)),
                )}
              </span>
            </div>
          ))}

          {/* Same width as the itemization above it. A narrower totals block
              reads as a different table and breaks the column the figures are
              meant to be compared down. */}
          <div className="pb-4 pt-2">
            {visit ? (
              <>
                {/* `subtotalCents` is the RETAIL subtotal — the counter models
                    device quotes as their own summand, and a bare "Subtotal
                    $24.00" under a $149.00 device line reads as an arithmetic
                    error to the person holding the paper. Name both summands. */}
                {lines.length > 0 ? (
                  <MoneyRow label="Retail" value={formatCents(visit.subtotalCents)} />
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
              {/* NEVER "Walk-in". That word asserts an intake channel, and on a
                  ticket whose channel is `shipment` it is simply false — the
                  name row would contradict the chip two lines above it. An
                  unknown name is an em dash. */}
              <Fact label="Name" value={customer?.name ?? '—'} />
              <Fact label="Phone" value={customer?.phone ?? '—'} />
              <Fact label="Email" value={customer?.email ?? '—'} />
            </FactGrid>
          )}
        </section>

        {origin && (origin.sourceOrderId || origin.sourceTrackingNumber || origin.sourceSku) ? (
          <section className={RECEIPT_MEASURE}>
            <h3 className={cn(KIOSK_SECTION_LABEL_ROW, 'px-0')}>Where it came from</h3>
            {/* Identifiers are CHIPS, not text: last-eight so they fit the
                column, one tap to copy the WHOLE value, and the SKU carries the
                way back to the listing it was sold from. */}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 py-3">
              {origin.sourceOrderId ? (
                <div className="min-w-0">
                  <dt className="text-role-caption uppercase tracking-wide text-text-soft">
                    {origin.sourceSystem ? `${origin.sourceSystem} order` : 'Order'}
                  </dt>
                  <dd className="mt-0.5">
                    <SourceOrderChip
                      value={origin.sourceOrderId}
                      display={getLast8(origin.sourceOrderId)}
                    />
                  </dd>
                </div>
              ) : null}
              {origin.sourceTrackingNumber ? (
                <div className="min-w-0">
                  <dt className="text-role-caption uppercase tracking-wide text-text-soft">
                    Tracking
                  </dt>
                  <dd className="mt-0.5">
                    <TrackingChip value={origin.sourceTrackingNumber} showIcon />
                  </dd>
                </div>
              ) : null}
              {origin.sourceSku ? (
                <div className="min-w-0">
                  <dt className="text-role-caption uppercase tracking-wide text-text-soft">
                    Listing SKU
                  </dt>
                  <dd className="mt-0.5 flex items-center gap-1">
                    <SkuScanRefChip
                      value={origin.sourceSku}
                      display={origin.sourceSku}
                    />
                    {storefrontHref ? (
                      <IconButton
                        icon={<ExternalLink className="h-3.5 w-3.5" />}
                        tone="accent"
                        ariaLabel="Open the storefront listing in a new tab"
                        onClick={() =>
                          window.open(storefrontHref, '_blank', 'noopener,noreferrer')
                        }
                        className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded hover:bg-surface-sunken"
                      />
                    ) : null}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        ) : null}

        {provenance.map((device) => {
          const draft = deviceDrafts[device.repairId];
          const technician =
            device.technicianSource && device.technicianName
              ? `${TECHNICIAN_PREFIX[device.technicianSource]} ${device.technicianName}`
              : 'No technician recorded';
          return (
            <section key={device.repairId} className={RECEIPT_MEASURE} data-testid="kiosk-history-device">
              <h3 className={cn(KIOSK_SECTION_LABEL_ROW, 'px-0')}>
                {device.rsNumber || `RS-${device.repairId}`}
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
              </div>

              {editing && draft ? (
                <div className="space-y-3 py-3">
                  <TextField
                    label="Serial number"
                    value={draft.serialNumber}
                    onChange={(serialNumber) =>
                      setDeviceDrafts((d) => ({
                        ...d,
                        [device.repairId]: { ...d[device.repairId], serialNumber },
                      }))
                    }
                    mono
                    inputClassName="rounded-none"
                    data-testid="kiosk-history-edit-serial"
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

              {/* Signatures are their own GROUP, not two loose images at the
                  tail of the facts: they are the evidence half of the record,
                  they are the only rows a dispute turns on, and each one is
                  captioned with the instant it was gathered — an unstamped
                  signature proves nothing about WHEN the customer agreed. */}
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

      {/* Fixed-width keys, seated in the RECORD's column.

          Two faults, both of alignment. First, a flex bar that let each key
          size to its own label moved every button whenever the record changed —
          `Print receipt` and `Print paperwork` are different lengths, so the
          primary key slid under the operator's thumb between two rows. One
          width for every text key, one square for the overflow.

          Second, the bar was flush to the PANE's right edge while everything it
          acts on sits in the receipt column — the keys hung off the side of the
          record, past its right margin. `RECEIPT_MEASURE` puts them on the same
          two edges as the itemization, the facts and the device cards. */}
      <div className="shrink-0 border-t border-border-soft px-4 py-3">
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
                {/* Three dots, no word. Square and Shopify both give the
                    overflow a glyph-only square — the label "More" costs a key's
                    width to say nothing, and the vertical ellipsis is the mark
                    the operator already reads as "everything else". */}
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
