'use client';

/**
 * The manual order intake — ONE form for a phone order, a pasted order, a
 * chat prefill (`?prefill=`) and a staged CSV row. Triage face
 * (`HANDOFF-manual-phone-order.md`): Customer · Items · Order · Payment ·
 * Shipping · Review, each a `rounded-mode` card that folds to a summary line
 * once filled; floating sticky buttons with the total chip left and the
 * decision right — no bar behind them (owner 2026-10-03).
 *
 * Save draft creates the order caged (every line under one number); Release
 * saves and lets it into To ship when the gates are green. A saved order stays
 * on the form: Buy with ShipStation, payment and the gates work on it.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import { ClipboardPaste, Plus } from '@/components/Icons';
import { StageStaffAssignPopover } from '@/components/staff-assign/StageStaffAssignPopover';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { Checkbox } from '@/design-system/primitives';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import { ACTION_DOCK_LIFT, ACTION_DOCK_TOP_GAP, FLOATING_ACTION_DISABLED_FACE } from '@/design-system/tokens/dock-clearance';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { usePlatformAccountCatalog, usePlatformCatalog, useStoreLinks } from '@/hooks/useCatalog';
import { requestOrderCapture } from '@/hooks/useOrderPasteIntake';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import type { CanonicalOrderIntake } from '@/lib/orders/canonical-order-intake';
import { PHONE_ORDER_CHANNEL, formatCents } from '@/lib/orders/manual-order-draft';
import { orderPlatformChoices } from '@/lib/platform-display';
import { toast } from '@/lib/toast';
import { saveWorkOrder } from '@/lib/work-orders/saveWorkOrder';
import { cn } from '@/utils/_cn';
import { IntakeCustomerFields } from './IntakeCustomerFields';
import { IntakeLineCard } from './IntakeLineCard';
import { IntakePaymentFields } from './IntakePaymentFields';
import { IntakeProductSearch } from './IntakeProductSearch';
import { searchProducts } from '@/lib/orders/intake/intake-product-client';
import { IntakeSection } from './IntakeSection';
import { IntakeShippingFields } from './IntakeShippingFields';
import {
  addressLine,
  emptyIntake,
  intakeBlockers,
  intakeFromCanonical,
  intakeToCanonical,
  intakeTotals,
  intakeWithCaptured,
  isDirty,
  newIntakeLine,
  shipToComplete,
  shipToRequired,
  type IntakeIntent,
  type IntakeLine,
  type IntakeState,
} from '@/lib/orders/intake/intake-model';
import { findOrderByNumber, nextOrderNumber, useOrderTriage } from '@/hooks/orders/useOrderTriage';

type SectionId = 'customer' | 'items' | 'order' | 'payment' | 'shipping';
const SECTION_ORDER: readonly SectionId[] = ['customer', 'items', 'order', 'payment', 'shipping'];

/** Matches a paste read can be trusted to pair on its own; anything fuzzier waits for the operator. */
const EXACT_MATCH: Record<string, true> = { sku: true, item_number: true, gtin: true, fnsku: true, asin: true };

/** Debounce for the inline order-number uniqueness check. */
const ORDER_NUMBER_CHECK_MS = 350;

/** The footer's opaque summary chip — its own face, never a strip across the form. */
const INTAKE_FOOTER_CHIP = 'pointer-events-auto min-w-0 rounded-mode border border-border-hairline bg-surface-card px-3 py-1.5 shadow-elev-soft';

/** A floating footer verb: takes presses, lifted off the form, opaque when disabled. */
const INTAKE_FOOTER_BUTTON = cn('pointer-events-auto shadow-elev-soft', FLOATING_ACTION_DISABLED_FACE);

interface OrderIntakeFormProps {
  /** Order under triage, or `null` to start a new one. */
  orderId: number | null;
  /** The saved (or opened-existing) order the form now works on — hosts bind their URL to it. */
  onOrderCreated?: (orderId: number) => void;
  /** Released into To ship — hosts close the entry. */
  onReleased?: () => void;
  /** Cancel / Close / Esc. Hosts that omit it paint no Cancel. */
  onCancel?: () => void;
  /** Prefill: a chat draft (`phoneOrder`) or a staged CSV row. Read once on mount. */
  initialDraft?: Partial<CanonicalOrderIntake>;
  /** Unbound edits projected back (CSV staging writes them onto its row). */
  onDraftChange?: (draft: CanonicalOrderIntake) => void;
}

export function OrderIntakeForm({
  orderId,
  onOrderCreated,
  onReleased,
  onCancel,
  initialDraft,
  onDraftChange,
}: OrderIntakeFormProps) {
  const [initial] = useState<IntakeState>(() => (initialDraft ? intakeFromCanonical(initialDraft) : emptyIntake()));
  const [state, setState] = useState<IntakeState>(initial);
  const patch = useCallback((next: Partial<IntakeState>) => setState((s) => ({ ...s, ...next })), []);
  // Lines this session created; a reopened caged order knows only its own row.
  const [createdIds, setCreatedIds] = useState<number[] | null>(null);
  const boundId = createdIds?.[0] ?? orderId;
  const sessionIds = useMemo(() => createdIds ?? (orderId ? [orderId] : []), [createdIds, orderId]);
  const bound = boundId != null;
  const triage = useOrderTriage(boundId);
  const record = triage.record;
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const [taken, setTaken] = useState<{ id: number; orderNumber: string } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [reading, setReading] = useState(false);
  const [showMore, setShowMore] = useState(() => Boolean(initial.shipBy || initial.isUrgent || initial.buyerNote || initial.adminUrl));
  const totals = intakeTotals(state);
  const manual = state.origin === 'manual';

  /* ── A reopened caged order (`?triage=<id>`): read its facts into the form once. ── */
  const hydratedFor = useRef<number | null>(null);
  useEffect(() => {
    if (!record || createdIds || hydratedFor.current === record.id || state.lines.length > 0) return;
    hydratedFor.current = record.id;
    const n = (v: number | null) => (v == null ? '' : String(v));
    setState((s) => ({
      ...s,
      origin: 'manual',
      orderNumber: record.orderNumber ?? '',
      channel: record.accountSource ?? s.channel,
      lines: [
        newIntakeLine({
          skuCatalogId: record.skuCatalogId,
          sku: record.sku ?? '',
          title: record.productTitle ?? '',
          itemNumber: record.itemNumber ?? '',
          quantity: Math.max(1, Number.parseInt(record.quantity ?? '1', 10) || 1),
        }),
      ],
      parcel: {
        weightOz: n(record.parcelWeightOz),
        lengthIn: n(record.parcelLengthIn),
        widthIn: n(record.parcelWidthIn),
        heightIn: n(record.parcelHeightIn),
      },
      trackingNumber: record.trackingNumber ?? '',
      docsNotRequired: record.docsNotRequired,
    }));
  }, [record, createdIds, state.lines.length]);

  /* ── CSV staging write-back ── */
  useEffect(() => {
    if (!bound) onDraftChange?.(intakeToCanonical(state));
  }, [state, bound, onDraftChange]);

  /* ── Order number: the channel's next number, unless the operator typed one ── */
  // A prefilled number (the chat's) stands until the channel changes or it turns out taken.
  // Keyed by the channel it was generated for, so a re-run (Strict Mode) is a no-op.
  const numberForChannel = useRef<string | null>(initial.orderNumber.trim() ? initial.channel : null);
  useEffect(() => {
    if (bound || !manual || !state.channel.trim() || numberForChannel.current === state.channel) return;
    if (state.orderNumber.trim() && !state.orderNumberGenerated) return;
    const channel = state.channel;
    numberForChannel.current = channel;
    void nextOrderNumber(channel).then((next) => {
      if (!next) return;
      // Lands only if the channel still wants it and the operator has not typed their own.
      setState((s) =>
        s.channel !== channel || (s.orderNumber.trim() && !s.orderNumberGenerated) ? s : { ...s, orderNumber: next, orderNumberGenerated: true },
      );
    });
    // Re-generate on a channel change only — the number itself is the effect's output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.channel, bound, manual]);

  useEffect(() => {
    const q = state.orderNumber.trim();
    if (bound || !q) {
      setTaken(null);
      return;
    }
    let live = true;
    const timer = window.setTimeout(() => {
      void findOrderByNumber(q).then((hit) => {
        if (!live) return;
        setTaken(hit);
        // A generated number someone took meanwhile: take the next one.
        if (hit && state.orderNumberGenerated) {
          void nextOrderNumber(state.channel).then((next) => {
            if (live && next && next !== q) setState((s) => ({ ...s, orderNumber: next, orderNumberGenerated: true }));
          });
        }
      });
    }, ORDER_NUMBER_CHECK_MS);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [state.orderNumber, state.orderNumberGenerated, state.channel, bound]);

  /* ── Channels: Phone first, then the org's platforms / accounts ── */
  const { rows: platforms, options: builtin } = usePlatformCatalog();
  const { rows: accounts } = usePlatformAccountCatalog();
  const { rows: links } = useStoreLinks();
  const channelOptions = useMemo(() => {
    const choices = platforms.length === 0 ? builtin.map((o) => ({ value: o.value, label: o.label })) : orderPlatformChoices(platforms, accounts, links);
    const out = [{ value: PHONE_ORDER_CHANNEL, label: PHONE_ORDER_CHANNEL }, ...choices.filter((c) => c.value.toLowerCase() !== 'phone')];
    if (state.channel && !out.some((o) => o.value.toLowerCase() === state.channel.toLowerCase())) {
      out.push({ value: state.channel, label: state.channel });
    }
    return out;
  }, [platforms, builtin, accounts, links, state.channel]);
  const channelLabel = channelOptions.find((o) => o.value.toLowerCase() === state.channel.toLowerCase())?.label ?? state.channel;

  /* ── Sections: filled ones fold to a summary; the one being worked stays open ── */
  const complete: Record<SectionId, boolean> = {
    customer: !manual || ((state.customer.id != null || Boolean(state.customer.name.trim())) && (!shipToRequired(state) || shipToComplete(state.customer.shipTo))),
    items: state.lines.length > 0 && state.lines.every((l) => l.title.trim() && (l.skuCatalogId != null || l.itemNumber.trim())),
    order: Boolean(state.orderNumber.trim() && state.channel.trim()) && taken == null,
    payment: !manual || totals.priced,
    shipping:
      state.shippingMode === 'pickup'
        ? true
        : state.shippingMode === 'elsewhere'
          ? Boolean(state.trackingNumber.trim())
          : Boolean(record?.shippingLabelPurchased || record?.shippingLabelLinked),
  };
  const firstIncomplete = SECTION_ORDER.find((id) => !complete[id]) ?? null;
  const [active, setActive] = useState<SectionId | null>(() => firstIncomplete);
  const isOpen = (id: SectionId) => active === id || (active == null && id === firstIncomplete);
  const done = (id: SectionId) => setActive(SECTION_ORDER.find((s) => s !== id && !complete[s]) ?? null);

  /* ── Lines ── */
  const setLine = (key: string, next: Partial<IntakeLine>) =>
    setState((s) => ({ ...s, lines: s.lines.map((l) => (l.key === key ? { ...l, ...next } : l)) }));
  const [adding, setAdding] = useState(false);

  /* ── Paste import: fills the form for review, never creates ── */
  const readPaste = useCallback(
    async (input: { text: string } | { files: File[] }) => {
      if ('text' in input && !input.text.trim()) return;
      setReading(true);
      try {
        const read = await requestOrderCapture(input).catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'Could not read that order.');
          return null;
        });
        const captured = read?.captured[0];
        if (!captured) {
          if (read) toast.error('Nothing order-like in that paste.');
          return;
        }
        let next = intakeWithCaptured(state, captured);
        if (captured.shipBy && /^\d{4}-\d{2}-\d{2}$/.test(captured.shipBy)) next = { ...next, shipBy: captured.shipBy };
        // Pair each pasted line the catalog answers exactly; the rest wait for the operator's pick.
        const lines = await Promise.all(
          next.lines.map(async (line) => {
            if (line.skuCatalogId != null) return line;
            const hits = await searchProducts(line.sku || line.itemNumber || line.title).catch(() => []);
            const hit = hits.length === 1 || (hits[0] && EXACT_MATCH[hits[0].matchedOn]) ? hits[0] : null;
            return hit
              ? { ...line, skuCatalogId: hit.skuCatalogId, sku: hit.sku, title: hit.title, itemNumber: line.itemNumber || hit.itemNumber || '', imageUrl: hit.imageUrl, onHand: hit.onHand, bin: hit.bin }
              : line;
          }),
        );
        setState({ ...next, lines });
        setPasteOpen(false);
        setPasteText('');
        setActive(null);
        toast.success('Read the paste into the form — check it before saving.');
      } finally {
        setReading(false);
      }
    },
    [state],
  );
  const onRootPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (bound || target.closest('input, textarea, [contenteditable="true"]')) return;
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    const text = e.clipboardData.getData('text/plain');
    if (files.length === 0 && !text.trim()) return;
    e.preventDefault();
    void readPaste(files.length > 0 ? { files } : { text });
  };

  /* ── Save / release ── */
  const releaseBlockers = intakeBlockers(state, 'release');
  const draftBlockers = intakeBlockers(state, 'draft');
  const submit = async (intent: IntakeIntent) => {
    if (bound) {
      // A saved order: land what changed on it, then release every line.
      if (state.shippingMode === 'elsewhere' && state.trackingNumber.trim() && !record?.trackingNumber) {
        await triage.attachTracking(sessionIds, state.trackingNumber.trim(), labelFile, state.orderNumber);
        setLabelFile(null);
      }
      if (await triage.release(sessionIds)) onReleased?.();
      return;
    }
    const result = await triage.save(state, { intent, labelFile });
    if (!result) return;
    setCreatedIds(result.orderIds);
    setState((s) => ({ ...s, orderNumber: result.orderNumber, orderNumberGenerated: false }));
    setLabelFile(null);
    onOrderCreated?.(result.orderIds[0]!);
    if (result.released) onReleased?.();
  };

  /* ── Leave: Esc / Cancel, with a discard check when unsaved work would be lost ── */
  const dirty = !bound && isDirty(state, initial);
  const leave = useCallback(() => {
    if (dirty) setConfirmDiscard(true);
    else onCancel?.();
  }, [dirty, onCancel]);
  useEffect(() => {
    if (!onCancel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || hasOpenOverlay()) return;
      if (document.querySelector('[data-radix-popper-content-wrapper]')) return;
      event.preventDefault();
      if (confirmDiscard) setConfirmDiscard(false);
      else leave();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmDiscard, leave, onCancel]);

  const busy = triage.saving || triage.releasing;
  const released = record?.releaseState === 'released';
  const itemCount = state.lines.reduce((n, l) => n + l.quantity, 0);

  return (
    <div className="flex min-w-0 flex-col" data-testid="order-intake-form" onPaste={onRootPaste}>
      <div className="flex items-center gap-2 px-1 pb-3">
        <h2 className="min-w-0 flex-1 truncate text-role-title font-semibold text-text-default">
          {bound ? (
            <>
              Order <span className="font-mono">{state.orderNumber}</span>
              <span className="text-text-muted">{released ? ' · released' : ' · draft'}</span>
            </>
          ) : manual && state.channel === PHONE_ORDER_CHANNEL ? (
            'New phone order'
          ) : (
            'New order'
          )}
        </h2>
        {!bound ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<ClipboardPaste className="size-4" />}
            onClick={() => setPasteOpen((v) => !v)}
            data-testid="intake-paste-toggle"
          >
            Paste an order
          </Button>
        ) : null}
      </div>

      {pasteOpen ? (
        <div className="mb-3 space-y-2 rounded-mode border border-border-hairline bg-surface-card p-4" data-testid="intake-paste">
          <TextField
            label="Paste an email, a marketplace row or a note"
            value={pasteText}
            onChange={setPasteText}
            multiline
            rows={6}
            data-testid="intake-paste-text"
          />
          <div className="flex items-center justify-end gap-2">
            <p className="mr-auto text-role-caption text-text-muted">Fills the form for review — nothing is created.</p>
            <Button variant="ghost" size="sm" onClick={() => setPasteOpen(false)}>Cancel</Button>
            <Button variant="ink" size="sm" loading={reading} disabled={!pasteText.trim()} onClick={() => void readPaste({ text: pasteText })} data-testid="intake-paste-read">
              Fill the form
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        <IntakeSection
          id="customer"
          title="Customer"
          complete={complete.customer}
          open={isOpen('customer')}
          onOpen={() => setActive('customer')}
          onDone={() => done('customer')}
          summary={
            [state.customer.name, state.customer.phone, addressLine(state.customer.shipTo)].filter((p) => p.trim()).join(' · ')
            || (manual ? 'Who is ordering, and where it ships' : 'Optional')
          }
        >
          <IntakeCustomerFields customer={state.customer} onChange={(customer) => patch({ customer })} />
        </IntakeSection>

        <IntakeSection
          id="items"
          title="Items"
          complete={complete.items}
          open={isOpen('items')}
          onOpen={() => setActive('items')}
          onDone={() => done('items')}
          summary={
            state.lines.length
              ? state.lines.map((l) => `${l.quantity} × ${l.title || l.sku}`).join(' · ')
              : 'No products yet'
          }
        >
          {state.lines.length > 0 ? (
            <ul className="space-y-2">
              {state.lines.map((line, i) => (
                <IntakeLineCard
                  key={line.key}
                  line={line}
                  index={i}
                  currency={state.currency}
                  onChange={(next) => setLine(line.key, next)}
                  onRemove={() => setState((s) => ({ ...s, lines: s.lines.filter((l) => l.key !== line.key) }))}
                />
              ))}
            </ul>
          ) : null}
          {state.lines.length === 0 || adding ? (
            <IntakeProductSearch
              testId="intake-product-search"
              onPick={(hit) => {
                setAdding(false);
                setState((s) => ({
                  ...s,
                  lines: [
                    ...s.lines,
                    newIntakeLine({
                      skuCatalogId: hit.skuCatalogId,
                      sku: hit.sku,
                      title: hit.title,
                      itemNumber: hit.itemNumber ?? '',
                      imageUrl: hit.imageUrl,
                      onHand: hit.onHand,
                      bin: hit.bin,
                    }),
                  ],
                }));
              }}
            />
          ) : (
            <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setAdding(true)} data-testid="intake-add-line">
              Add another item
            </Button>
          )}
        </IntakeSection>

        <IntakeSection
          id="order"
          title="Order"
          complete={complete.order}
          open={isOpen('order')}
          onOpen={() => setActive('order')}
          onDone={() => done('order')}
          summary={[state.orderNumber, channelLabel, state.shipBy ? `ship by ${state.shipBy}` : null, state.isUrgent ? 'urgent' : null].filter(Boolean).join(' · ')}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Order number"
              value={state.orderNumber}
              onChange={(v) => patch({ orderNumber: v, orderNumberGenerated: false })}
              mono
              disabled={bound}
              autoComplete="off"
              data-testid="intake-order-number"
            />
            <SearchableSelectField
              value={channelOptions.find((o) => o.value.toLowerCase() === state.channel.toLowerCase())?.value ?? null}
              onChange={(value) => value != null && patch({ channel: String(value) })}
              options={channelOptions}
              label="Channel"
              placeholder="Pick the channel"
              ariaLabel="Channel"
              disabled={bound}
              testId="intake-channel"
              className="h-11 rounded-mode-control px-3.5 pb-1 pt-5 text-sm"
            />
          </div>
          {taken ? (
            <div className="flex items-center gap-2 rounded-mode-control bg-surface-warning px-3 py-2" role="status" data-testid="intake-order-taken">
              <p className="min-w-0 flex-1 text-role-caption text-text-warning">
                Order <span className="font-mono">{taken.orderNumber}</span> already exists.
              </p>
              {onOrderCreated ? (
                <Button variant="secondary" size="sm" onClick={() => onOrderCreated(taken.id)}>Open it</Button>
              ) : null}
            </div>
          ) : !bound && state.orderNumberGenerated ? (
            <p className="text-role-caption text-text-muted">Next free {channelLabel} number — type over it to use your own.</p>
          ) : null}

          {showMore ? (
            <div className="grid gap-3 sm:grid-cols-2" data-testid="intake-order-more">
              <div>
                <p className="mode-label pb-1 text-text-soft">Ship by</p>
                <DateRangePickerField
                  variant="compact"
                  value={state.shipBy ? new Date(`${state.shipBy}T12:00:00`) : undefined}
                  onChange={(day) => patch({ shipBy: `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}` })}
                  ariaLabel="Ship by"
                  className="h-11 w-full rounded-mode-control border border-border-soft px-3.5 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 self-end pb-3 text-role-body text-text-default">
                <Checkbox checked={state.isUrgent} onCheckedChange={(v) => patch({ isUrgent: v === true })} />
                Urgent
              </label>
              <TextField label="Buyer note" value={state.buyerNote} onChange={(v) => patch({ buyerNote: v })} className="sm:col-span-2" />
              <TextField label="Admin page link" value={state.adminUrl} onChange={(v) => patch({ adminUrl: v })} className="sm:col-span-2" inputMode="url" />
            </div>
          ) : (
            <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={() => setShowMore(true)} data-testid="intake-order-more-toggle">
              Ship by, urgent, note, admin link
            </Button>
          )}
        </IntakeSection>

        <IntakeSection
          id="payment"
          title="Payment"
          complete={complete.payment}
          open={isOpen('payment')}
          onOpen={() => setActive('payment')}
          onDone={() => done('payment')}
          summary={totals.subtotalCents > 0 ? `${formatCents(totals.totalCents, state.currency)} total` : 'No prices yet'}
        >
          <IntakePaymentFields totals={totals} currency={state.currency} orderNumber={bound ? state.orderNumber : null} shippingMode={state.shippingMode} />
        </IntakeSection>

        <IntakeSection
          id="shipping"
          title="Shipping"
          complete={complete.shipping}
          open={isOpen('shipping')}
          onOpen={() => setActive('shipping')}
          onDone={() => done('shipping')}
          summary={
            state.shippingMode === 'pickup'
              ? 'Pickup / walk-in — no label'
              : state.shippingMode === 'elsewhere'
                ? state.trackingNumber ? `Tracking ${state.trackingNumber}${labelFile ? ' · label attached' : ''}` : 'Bought elsewhere — no tracking yet'
                : record?.shippingLabelPurchased ? 'Label bought with ShipStation' : 'Buy with ShipStation'
          }
        >
          <IntakeShippingFields
            state={state}
            onChange={(p) => {
              patch(p);
              // A saved order carries the pickup fact server-side — the release gates read it.
              if (bound && p.shippingMode && (p.shippingMode === 'pickup') !== (state.shippingMode === 'pickup')) {
                void triage.setPickup(sessionIds, p.shippingMode === 'pickup');
              }
            }}
            labelFile={labelFile}
            onLabelFile={setLabelFile}
            bound={boundId != null ? { orderId: boundId, orderRef: state.orderNumber, onLabelChanged: triage.refresh } : null}
          />
        </IntakeSection>

        <ReviewCard
          state={state}
          onChange={patch}
          blockers={bound ? [] : releaseBlockers}
          gates={record?.gates ?? null}
          sessionIds={sessionIds}
          onDocsNotRequired={(value) => (bound ? triage.setDocsNotRequired(sessionIds, value) : undefined)}
        />
      </div>

      {/* Floating sticky buttons, no card or bar behind them (owner 2026-10-03): only the
          buttons and the opaque summary chip take presses; the form scrolls under the gutters. */}
      <footer className={cn('pointer-events-none sticky bottom-0 z-10 mt-3 flex items-center gap-2', ACTION_DOCK_TOP_GAP, ACTION_DOCK_LIFT)} data-testid="intake-footer">
        {confirmDiscard ? (
          <>
            <div className="flex min-w-0 flex-1">
              <p className={cn(INTAKE_FOOTER_CHIP, 'text-role-body text-text-default')}>Discard this order? Nothing has been saved.</p>
            </div>
            <Button variant="secondary" size="sm" className={INTAKE_FOOTER_BUTTON} onClick={() => setConfirmDiscard(false)}>Keep editing</Button>
            <Button variant="danger" size="sm" className={INTAKE_FOOTER_BUTTON} onClick={() => onCancel?.()} data-testid="intake-discard">Discard</Button>
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-1">
              <div className={INTAKE_FOOTER_CHIP}>
                <p className="text-role-body font-semibold tabular-nums text-text-default" data-testid="intake-total">
                  {formatCents(totals.totalCents, state.currency)}
                </p>
                <p className="truncate text-role-caption text-text-muted">
                  {itemCount} item{itemCount === 1 ? '' : 's'}
                  {(bound ? [] : draftBlockers)[0] ? ` · ${draftBlockers[0]}` : ''}
                </p>
              </div>
            </div>
            {onCancel ? (
              <Button variant="secondary" size="sm" className={INTAKE_FOOTER_BUTTON} onClick={leave} data-testid="intake-cancel">{bound ? 'Close' : 'Cancel'}</Button>
            ) : null}
            {!bound ? (
              <Button variant="secondary" size="sm" className={INTAKE_FOOTER_BUTTON} disabled={busy || draftBlockers.length > 0} loading={triage.saving} onClick={() => void submit('draft')} data-testid="intake-save-draft">
                Save draft
              </Button>
            ) : null}
            {!released ? (
              <Button
                variant="ink"
                size="sm"
                className={INTAKE_FOOTER_BUTTON}
                disabled={busy || (bound ? false : releaseBlockers.length > 0)}
                loading={busy}
                onClick={() => void submit('release')}
                data-testid="intake-release"
              >
                Release
              </Button>
            ) : null}
          </>
        )}
      </footer>
    </div>
  );
}

/** Review — what still blocks release, the live gates once saved, and the optional assignees. */
function ReviewCard({
  state,
  onChange,
  blockers,
  gates,
  sessionIds,
  onDocsNotRequired,
}: {
  state: IntakeState;
  onChange: (patch: Partial<IntakeState>) => void;
  blockers: string[];
  gates: { canRelease: boolean; gates: Array<{ id: string; label: string; passed: boolean; reason: string | null }> } | null;
  sessionIds: readonly number[];
  onDocsNotRequired: (value: boolean) => void;
}) {
  return (
    <section className="space-y-3 rounded-mode border border-border-hairline bg-surface-card p-4" data-testid="intake-review">
      <h3 className="text-role-body font-semibold text-text-default">Review</h3>
      {gates ? (
        <ul className="space-y-1.5" data-testid="intake-gates">
          {gates.gates.map((g) => (
            <li key={g.id} className="flex items-start gap-2 text-role-caption">
              <span className={cn('mt-0.5 size-2 shrink-0 rounded-mode-pill', g.passed ? 'bg-text-success' : 'bg-text-warning')} aria-hidden />
              <span className="min-w-0">
                <span className="text-text-default">{g.label}</span>
                {g.reason ? <span className="block text-text-muted">{g.reason}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : blockers.length > 0 ? (
        <ul className="space-y-1" data-testid="intake-blockers">
          {blockers.map((b) => (
            <li key={b} className="flex items-center gap-2 text-role-caption text-text-muted">
              <span className="size-2 shrink-0 rounded-mode-pill bg-text-warning" aria-hidden />
              {b}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-role-caption text-text-success">Ready to release.</p>
      )}
      <label className="flex items-start gap-2 text-role-body text-text-default">
        <Checkbox
          checked={state.docsNotRequired}
          onCheckedChange={(v) => {
            onChange({ docsNotRequired: v === true });
            onDocsNotRequired(v === true);
          }}
          data-testid="intake-docs-not-required"
        />
        <span>
          No manual or paperwork needed
          <span className="block text-role-caption text-text-muted">Recorded on the order for the release audit.</span>
        </span>
      </label>
      {sessionIds.length > 0 ? <AssignRow sessionIds={sessionIds} shipBy={state.shipBy} /> : null}
    </section>
  );
}

/** Pick / Pack assignees (optional) — the house staff picker, written to every line. */
function AssignRow({ sessionIds, shipBy }: { sessionIds: readonly number[]; shipBy: string | null }) {
  const [staff, setStaff] = useState<{ technician: { id: number | null; name: string | null }; packer: { id: number | null; name: string | null } }>({
    technician: { id: null, name: null },
    packer: { id: null, name: null },
  });
  const [open, setOpen] = useState<'technician' | 'packer' | null>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const packRef = useRef<HTMLButtonElement>(null);
  const commit = async (lane: 'technician' | 'packer', id: number | null, name: string | null) => {
    const next = { ...staff, [lane]: { id, name } };
    setStaff(next);
    try {
      await Promise.all(
        sessionIds.map((entityId) =>
          saveWorkOrder({
            entityType: 'ORDER',
            entityId,
            assignedTechId: next.technician.id,
            assignedPackerId: next.packer.id,
            status: next.technician.id != null ? 'ASSIGNED' : 'OPEN',
            priority: 100,
            deadlineAt: shipBy,
          }),
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the assignee.');
    }
  };
  const chip = (lane: 'technician' | 'packer', label: string, ref: React.RefObject<HTMLButtonElement>) => (
    <button
      ref={ref}
      type="button"
      onClick={() => setOpen(lane)}
      className={cn('inline-flex h-9 items-center gap-1.5 rounded-mode-control border border-border-soft px-3 text-role-caption text-text-default hover:bg-surface-hover', focusRing('control'))}
      data-testid={`intake-assign-${lane}`}
    >
      <span className="text-text-muted">{label}</span> {staff[lane].name ?? 'Unassigned'}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chip('technician', 'Pick', pickRef)}
      {chip('packer', 'Pack', packRef)}
      <StageStaffAssignPopover
        open={open === 'technician'}
        onClose={() => setOpen(null)}
        anchorRef={pickRef}
        label="Pick"
        role="technician"
        selectedStaffId={staff.technician.id}
        onCommit={(id, name) => void commit('technician', id, name)}
      />
      <StageStaffAssignPopover
        open={open === 'packer'}
        onClose={() => setOpen(null)}
        anchorRef={packRef}
        label="Pack"
        role="packer"
        selectedStaffId={staff.packer.id}
        onCommit={(id, name) => void commit('packer', id, name)}
      />
    </div>
  );
}
