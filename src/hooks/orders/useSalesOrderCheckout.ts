'use client';

/**
 * The new-sales-order job — ONE step machine, painted by two faces: the desk
 * (`/orders/new`, dense, keyboard-first) and the phone (`/m/orders/new`,
 * thumb-first). Everything here is behaviour; nothing here renders.
 *
 *  - How the order arrives (`mode`): typed on the call, a Square invoice, or an
 *    Ecwid order. An import fills customer, every line, prices and the order
 *    number, then lands on Team. A walk-in (no ship-to) defaults to pickup.
 *  - The trail: Customer › Products › Team › Order › Shipping › Payment. Any
 *    step is reachable; picking a customer moves to Products.
 *  - Cart: a catalog hit (same product again = qty +1) or a storefront listing
 *    (keyed by its listing id as the item #).
 *  - Save / release: save HELD, write picker + packer, link the Square invoice,
 *    THEN release — the floor never sees the order unassigned.
 *  - The call timer starts at the first change and stops at release.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlatformAccountCatalog, usePlatformCatalog, useStoreLinks } from '@/hooks/useCatalog';
import { nextOrderNumber, useOrderTriage, type OrderTriage } from '@/hooks/orders/useOrderTriage';
import { commitAssignments, useRuleAssignments, type RuleAssignments } from '@/hooks/orders/useRuleAssignments';
import type { IntakeProductHit } from '@/lib/orders/intake-product-search';
import type { EcwidOrderImport } from '@/lib/orders/ecwid-order-import';
import type { SquareInvoiceImport } from '@/lib/orders/square-invoice-import-core';
import {
  CHECKOUT_STEPS,
  checkoutModeFromParam,
  testOrderNumber,
  type CheckoutMode,
  type CheckoutStepId,
  type ListingLine,
} from '@/lib/orders/intake/checkout-model';
import type { CatalogShelf } from '@/lib/orders/intake/catalog-shelf';
import {
  emptyIntake,
  intakeBlockers,
  intakeFromManualDraft,
  intakeTotals,
  heldLineBody,
  isDirty,
  newIntakeLine,
  shipToComplete,
  shipToRequired,
  testOrderFill,
  type IntakeIntent,
  type IntakeLine,
  type IntakeState,
} from '@/lib/orders/intake/intake-model';
import { searchProducts } from '@/lib/orders/intake/intake-product-client';
import {
  type ManualOrderTotals,
  ORDER_PREFILL_PARAM,
  PHONE_ORDER_CHANNEL,
  clearStashedOrderPrefill,
  decodeOrderPrefill,
  readStashedOrderPrefill,
} from '@/lib/orders/manual-order-draft';
import { orderPlatformChoices } from '@/lib/platform-display';
import { toast } from '@/lib/toast';
import { localDateToDateKey } from '@/utils/date';

/** A paired match the operator does not need to confirm (same rule as the paste import). */
const EXACT_MATCH: Record<string, true> = { sku: true, item_number: true, gtin: true, fnsku: true, asin: true };
/** The storefront sync's channel label (`orders.account_source`). */
const ECWID_CHANNEL = 'ecwid';
/** Test mode rides the tab (sessionStorage): it survives Next order and a reload, never another tab. */
const TEST_MODE_KEY = 'cf:new-sales-order:test-mode';
/** A cart edit after the draft save lands on its held row once typing rests this long. */
const LINE_SYNC_DEBOUNCE_MS = 600;
/** Test fill's product search — the first query with a hit wins. */
const TEST_FILL_QUERIES = ['bose', 'speaker', 'a'] as const;

export function elapsedLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const bump = (l: IntakeLine) => ({ ...l, quantity: Math.min(9999, l.quantity + 1) });

export interface SalesOrderCheckoutOptions {
  /** First session on this page load — only it reads `?prefill=`, `?mode=`, `?scan=` and `?test=1`. */
  first: boolean;
  /** The page's search params (`useSearchParams()`), read once. */
  params: { get(name: string): string | null };
}

/** The step machine both faces paint. */
export interface SalesOrderCheckout {
  state: IntakeState;
  patch: (next: Partial<IntakeState>) => void;
  mode: CheckoutMode;
  setMode: (mode: CheckoutMode) => void;
  /** New → Square → Ecwid → New (the desk's ⌥/Alt+I). No-op once saved. */
  cycleMode: () => void;
  /** An import list is on screen instead of the steps. */
  choosingImport: boolean;
  invoice: SquareInvoiceImport | null;
  ecwidOrder: EcwidOrderImport | null;
  importInvoice: (invoice: SquareInvoiceImport) => Promise<void>;
  importEcwidOrder: (order: EcwidOrderImport) => void;
  /**
   * Test mode: the order saves as `CF-TEST-<number>` (so an already-imported
   * Square invoice / Ecwid order can be imported again), a Square invoice is
   * never linked, and no payment is requested. Release still lands it in To
   * ship — live, like any order — so the whole path can be rehearsed.
   */
  testMode: boolean;
  setTestMode: (on: boolean) => void;
  /**
   * Test mode only, before the first save: fill every step (test buyer, one
   * real catalog product, Phone, ship-by today, Pickup) and open Payment, so a
   * test order is one press from release.
   */
  fillTestOrder: () => Promise<void>;
  /** A fill is fetching its product. */
  filling: boolean;
  step: CheckoutStepId;
  setStep: (step: CheckoutStepId) => void;
  stepIndex: number;
  goStep: (delta: 1 | -1) => void;
  nextStep: (typeof CHECKOUT_STEPS)[number] | null;
  prevStep: (typeof CHECKOUT_STEPS)[number] | null;
  stepDone: Record<CheckoutStepId, boolean>;
  /** Phone first, then the org's channels (plus the current one when it is not listed). */
  channelOptions: Array<{ value: string; label: string }>;
  addProduct: (hit: IntakeProductHit) => void;
  addListing: (listing: ListingLine) => void;
  setLine: (key: string, next: Partial<IntakeLine>) => void;
  removeLine: (key: string) => void;
  itemCount: number;
  totals: ManualOrderTotals;
  releaseBlockers: string[];
  draftBlockers: string[];
  team: RuleAssignments;
  triage: OrderTriage;
  createdIds: number[] | null;
  /** Saved as a held draft — the steps now edit that order. */
  bound: boolean;
  busy: boolean;
  labelFile: File | null;
  setLabelFile: (file: File | null) => void;
  /** Which storefront shelf the Products step browses and searches — Sales or Repair service; one cart. */
  shelf: CatalogShelf;
  setShelf: (shelf: CatalogShelf) => void;
  /** Sales ↔ Repair service (the desk's ⌥/Alt+R). */
  toggleShelf: () => void;
  /** Save a draft (returns its number) or save-and-release. */
  submit: (intent: IntakeIntent) => Promise<string | null>;
  released: boolean;
  startedAt: number | null;
  elapsed: number;
  finishedMs: number | null;
}

export function useSalesOrderCheckout({ first, params }: SalesOrderCheckoutOptions): SalesOrderCheckout {
  /* ── Seed: a chat-drafted order (`?prefill=` / stash), or a scanned order number (`?scan=`) ── */
  const [initial, setInitial] = useState<IntakeState>(() => {
    const draft = first ? decodeOrderPrefill(params.get(ORDER_PREFILL_PARAM) ?? readStashedOrderPrefill()) : null;
    const base = draft ? intakeFromManualDraft(draft) : emptyIntake('manual');
    const scanned = first ? params.get('scan')?.trim() : '';
    return scanned ? { ...base, orderNumber: scanned, orderNumberGenerated: false } : base;
  });
  const [state, setState] = useState<IntakeState>(initial);
  const patch = useCallback((next: Partial<IntakeState>) => setState((s) => ({ ...s, ...next })), []);
  useEffect(() => clearStashedOrderPrefill, []);
  // Ship by defaults to the most urgent day — the operator's today, read after
  // mount (the server renders in its own timezone). It lands on `initial` too,
  // so the default is not a change: no timer, no leave-page prompt.
  useEffect(() => {
    const today = localDateToDateKey(new Date());
    setInitial((s) => (s.shipBy ? s : { ...s, shipBy: today }));
    setState((s) => (s.shipBy ? s : { ...s, shipBy: today }));
  }, []);

  /* ── The Products step's shelf ── */
  const [shelf, setShelf] = useState<CatalogShelf>('sales');
  const toggleShelf = useCallback(() => setShelf((s) => (s === 'sales' ? 'repair' : 'sales')), []);

  const [createdIds, setCreatedIds] = useState<number[] | null>(null);
  const bound = createdIds != null;
  const triage = useOrderTriage(createdIds?.[0] ?? null);
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const [released, setReleased] = useState(false);

  /* ── Test mode (`?test=1`, or still on from earlier in this tab) ── */
  const [testMode, setTestModeState] = useState(() => first && params.get('test') === '1');
  useEffect(() => {
    if (window.sessionStorage.getItem(TEST_MODE_KEY) === '1') setTestModeState(true);
  }, []);
  const setTestMode = useCallback((on: boolean) => {
    setTestModeState(on);
    if (on) window.sessionStorage.setItem(TEST_MODE_KEY, '1');
    else window.sessionStorage.removeItem(TEST_MODE_KEY);
  }, []);
  useEffect(() => {
    if (testMode) window.sessionStorage.setItem(TEST_MODE_KEY, '1');
  }, [testMode]);

  /* ── Arrival mode + imports ── */
  const [mode, setMode] = useState<CheckoutMode>(() => (first ? checkoutModeFromParam(params.get('mode')) : 'new'));
  const [invoice, setInvoice] = useState<SquareInvoiceImport | null>(null);
  const [ecwidOrder, setEcwidOrder] = useState<EcwidOrderImport | null>(null);
  const imported = invoice != null || ecwidOrder != null;
  /** An import list is on screen instead of the steps. */
  const choosingImport = mode !== 'new' && !imported;

  /* ── The trail ── */
  const [step, setStep] = useState<CheckoutStepId>('customer');
  const stepIndex = CHECKOUT_STEPS.findIndex((s) => s.id === step);
  const goStep = useCallback((delta: 1 | -1) => {
    setStep((cur) => {
      const at = CHECKOUT_STEPS.findIndex((s) => s.id === cur);
      return CHECKOUT_STEPS[Math.min(CHECKOUT_STEPS.length - 1, Math.max(0, at + delta))]!.id;
    });
  }, []);
  const nextStep = CHECKOUT_STEPS[stepIndex + 1] ?? null;
  const prevStep = CHECKOUT_STEPS[stepIndex - 1] ?? null;

  const importInvoice = useCallback(async (inv: SquareInvoiceImport) => {
    setInvoice(inv);
    const lines = await Promise.all(
      inv.lines.map(async (l) => {
        const base = newIntakeLine({
          title: l.title,
          sku: l.sku ?? '',
          quantity: Math.max(1, l.quantity),
          unitPrice: l.unitCents != null ? (l.unitCents / 100).toFixed(2) : '',
        });
        const hits = await searchProducts(l.sku || l.title).catch(() => []);
        const hit = hits.length === 1 || (hits[0] && EXACT_MATCH[hits[0].matchedOn]) ? hits[0] : null;
        return hit
          ? { ...base, skuCatalogId: hit.skuCatalogId, sku: hit.sku, title: hit.title, itemNumber: hit.itemNumber ?? '', imageUrl: hit.imageUrl, onHand: hit.onHand, bin: hit.bin }
          : base;
      }),
    );
    setState((s) => ({
      ...s,
      customer: { id: null, name: inv.customer.name, phone: inv.customer.phone, email: inv.customer.email, shipTo: { ...inv.customer.shipTo, country: inv.customer.shipTo.country || 'US' } },
      lines,
      channel: 'Square',
      orderNumber: inv.orderNumber,
      orderNumberGenerated: false,
      currency: inv.currency || s.currency,
      // A walk-in invoice carries no ship-to — it leaves over the counter.
      shippingMode: inv.hasShipTo ? s.shippingMode : 'pickup',
    }));
    // What is left is the internal half: who picks, who packs.
    setStep('team');
  }, []);

  const importEcwidOrder = useCallback((order: EcwidOrderImport) => {
    setEcwidOrder(order);
    // Lines land as the storefront sync writes them (item # = what Ecwid names);
    // pairing to the catalog runs the one pairing path every order takes.
    const lines = order.lines.map((l) =>
      newIntakeLine({
        title: l.title,
        sku: l.sku,
        itemNumber: l.itemNumber,
        quantity: l.quantity,
        unitPrice: l.unitCents != null ? (l.unitCents / 100).toFixed(2) : '',
      }),
    );
    const tracking = order.trackingNumbers[0] ?? '';
    setState((s) => ({
      ...s,
      customer: { id: null, name: order.customer.name, phone: order.customer.phone, email: order.customer.email, shipTo: order.customer.shipTo },
      lines,
      channel: ECWID_CHANNEL,
      orderNumber: order.orderNumber,
      orderNumberGenerated: false,
      currency: order.currency || s.currency,
      buyerNote: order.buyerNote || s.buyerNote,
      trackingNumber: tracking,
      shippingMode: tracking ? 'elsewhere' : order.hasShipTo ? s.shippingMode : 'pickup',
    }));
    setStep('team');
  }, []);

  /** Leave an import: back to a blank typed order. */
  const cycleMode = useCallback(() => {
    if (bound) return;
    setMode((m) => (m === 'new' ? 'square' : m === 'square' ? 'ecwid' : 'new'));
  }, [bound]);

  /* ── Call timer: starts at the first change, stops at release ── */
  const dirty = isDirty(state, initial);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [finishedMs, setFinishedMs] = useState<number | null>(null);
  useEffect(() => {
    if (dirty && startedAt == null) setStartedAt(Date.now());
  }, [dirty, startedAt]);
  useEffect(() => {
    if (startedAt == null || finishedMs != null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt, finishedMs]);
  const elapsed = finishedMs ?? (startedAt == null ? 0 : now - startedAt);

  /* ── Order number: the channel's next number unless the operator typed one ──
     Test mode prefixes it at save (`testOrderNumber`); a taken test number
     re-draws from the test sequence there (`useOrderTriage.save`). */
  const numberFor = useRef<string | null>(initial.orderNumber.trim() ? initial.channel : null);
  useEffect(() => {
    if (bound || !state.channel.trim() || numberFor.current === state.channel) return;
    if (state.orderNumber.trim() && !state.orderNumberGenerated) return;
    const channel = state.channel;
    numberFor.current = channel;
    void nextOrderNumber(channel).then((next) => {
      if (!next) return;
      setState((s) =>
        s.channel !== channel || (s.orderNumber.trim() && !s.orderNumberGenerated) ? s : { ...s, orderNumber: next, orderNumberGenerated: true },
      );
    });
    // Re-generate on a channel change only — the number is this effect's output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.channel, bound]);

  /* ── Channels: Phone first, then the org's accounts ── */
  const { rows: platforms, options: builtin } = usePlatformCatalog();
  const { rows: accounts } = usePlatformAccountCatalog();
  const { rows: links } = useStoreLinks();
  const channelOptions = useMemo(() => {
    const choices = platforms.length === 0 ? builtin.map((o) => ({ value: o.value, label: o.label })) : orderPlatformChoices(platforms, accounts, links);
    const out = [{ value: PHONE_ORDER_CHANNEL, label: PHONE_ORDER_CHANNEL }, ...choices.filter((c) => c.value.toLowerCase() !== 'phone')];
    if (state.channel && !out.some((o) => o.value.toLowerCase() === state.channel.toLowerCase())) out.push({ value: state.channel, label: state.channel });
    return out;
  }, [platforms, builtin, accounts, links, state.channel]);

  /* ── Customer picked → straight to Products ── */
  const customerId = state.customer.id;
  const prevCustomerId = useRef(customerId);
  useEffect(() => {
    if (prevCustomerId.current == null && customerId != null) setStep('products');
    prevCustomerId.current = customerId;
  }, [customerId]);

  /* ── Cart ── */
  // After the draft save the saved rows ARE the order: a line already on it
  // edits in place (synced below); a new line or a removed one would change the
  // order's rows, which a held draft does not do — say so instead.
  const boundRef = useRef(false);
  boundRef.current = bound;
  const linesRef = useRef(state.lines);
  linesRef.current = state.lines;
  const draftNumberRef = useRef(state.orderNumber);
  draftNumberRef.current = state.orderNumber;
  /** Saved draft + a product not already on it → refused (toast); `true` when the add may go ahead. */
  const mayAddLine = (onCart: (l: IntakeLine) => boolean): boolean => {
    if (!boundRef.current || linesRef.current.some(onCart)) return true;
    toast.error(`Draft ${draftNumberRef.current} is saved — its products are set. Start a new order to add another.`);
    return false;
  };
  const addProduct = useCallback((hit: IntakeProductHit) => {
    if (!mayAddLine((l) => l.skuCatalogId === hit.skuCatalogId)) return;
    setState((s) => {
      const same = s.lines.find((l) => l.skuCatalogId === hit.skuCatalogId);
      if (same) return { ...s, lines: s.lines.map((l) => (l === same ? bump(l) : l)) };
      const line = newIntakeLine({
        skuCatalogId: hit.skuCatalogId,
        sku: hit.sku,
        title: hit.title,
        itemNumber: hit.itemNumber ?? '',
        imageUrl: hit.imageUrl,
        onHand: hit.onHand,
        bin: hit.bin,
        unitPrice: hit.suggestedUnitCents != null ? (hit.suggestedUnitCents / 100).toFixed(2) : '',
      });
      return { ...s, lines: [...s.lines, line] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads refs only
  }, []);
  // A browse tile: the listing itself, its id as the item # (what a web order for it carries).
  const addListing = useCallback((listing: ListingLine) => {
    if (!mayAddLine((l) => l.skuCatalogId == null && l.itemNumber === listing.listingId)) return;
    setState((s) => {
      const same = s.lines.find((l) => l.skuCatalogId == null && l.itemNumber === listing.listingId);
      if (same) return { ...s, lines: s.lines.map((l) => (l === same ? bump(l) : l)) };
      const line = newIntakeLine({
        sku: listing.sku,
        title: listing.title,
        itemNumber: listing.listingId,
        unitPrice: listing.unitCents != null ? (listing.unitCents / 100).toFixed(2) : '',
      });
      return { ...s, lines: [...s.lines, line] };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads refs only
  }, []);
  const setLine = useCallback(
    (key: string, next: Partial<IntakeLine>) => setState((s) => ({ ...s, lines: s.lines.map((l) => (l.key === key ? { ...l, ...next } : l)) })),
    [],
  );
  const removeLine = useCallback((key: string) => {
    if (boundRef.current) {
      toast.error('This line is on the saved draft — set its quantity instead, or start a new order.');
      return;
    }
    setState((s) => ({ ...s, lines: s.lines.filter((l) => l.key !== key) }));
  }, []);

  /* ── Saved lines: a cart edit after the draft save lands on its held row ── */
  const savedLines = useRef(new Map<string, { orderId: number; json: string }>());
  const pendingLineEdits = useCallback(
    (lines: readonly IntakeLine[]) =>
      lines.flatMap((l) => {
        const saved = savedLines.current.get(l.key);
        if (!saved) return [];
        const line = heldLineBody(l);
        const json = JSON.stringify(line);
        return json === saved.json ? [] : [{ key: l.key, orderId: saved.orderId, line, json }];
      }),
    [],
  );
  /** Write every changed saved line now; `false` when one did not land. */
  const syncLines = useCallback(async (): Promise<boolean> => {
    const edits = pendingLineEdits(state.lines);
    if (edits.length === 0) return true;
    const ok = await triage.setLines(edits);
    if (ok) for (const e of edits) savedLines.current.set(e.key, { orderId: e.orderId, json: e.json });
    return ok;
  }, [pendingLineEdits, state.lines, triage]);
  const syncLinesRef = useRef(syncLines);
  syncLinesRef.current = syncLines;
  // Debounced: a typed price or a stepper run lands once the thumb / keys rest.
  useEffect(() => {
    if (!bound || released || pendingLineEdits(state.lines).length === 0) return;
    const timer = window.setTimeout(() => void syncLinesRef.current(), LINE_SYNC_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [bound, released, state.lines, pendingLineEdits]);

  /* ── Save / release ── */
  const totals = intakeTotals(state);
  const releaseBlockers = intakeBlockers(state, 'release');
  const draftBlockers = intakeBlockers(state, 'draft');
  const busy = triage.saving || triage.releasing;
  const team = useRuleAssignments(state.lines, state.channel);
  const teamDone = state.lines.length > 0 && state.lines.every((l) => team.byKey[l.key]?.picker && team.byKey[l.key]?.packer);

  const finish = useCallback((orderNumber: string) => {
    const took = startedAt == null ? 0 : Date.now() - startedAt;
    setFinishedMs(took);
    setReleased(true);
    toast.success(`Order ${orderNumber} released — taken in ${elapsedLabel(took)}.`);
  }, [startedAt]);

  const submit = useCallback(
    async (intent: IntakeIntent): Promise<string | null> => {
      if (busy) return null;
      if (bound) {
        // Land any cart edit on the held rows first — a payment reads their amounts.
        const synced = await syncLines();
        if (intent === 'draft') return synced ? state.orderNumber : null;
        if (!synced) return null;
        const pickup = state.shippingMode === 'pickup';
        // Pickup ↔ ship changed after the draft save — the gates read the saved fact.
        if (triage.record && triage.record.pickup !== pickup) await triage.setPickup(createdIds!, pickup);
        if (state.shippingMode === 'elsewhere' && state.trackingNumber.trim() && !triage.record?.trackingNumber) {
          await triage.attachTracking(createdIds!, state.trackingNumber.trim(), labelFile, state.orderNumber);
          setLabelFile(null);
        }
        // Exceptions made after the draft save land before the order goes to the floor.
        await commitAssignments(state.lines, createdIds!, team.byKey);
        if (await triage.release(createdIds!)) finish(state.orderNumber);
        return state.orderNumber;
      }
      const blockers = intent === 'release' ? releaseBlockers : draftBlockers;
      if (blockers.length > 0) {
        toast.error(blockers[0]!);
        return null;
      }
      // Save held (draft), put the team on it, THEN release — the floor never
      // sees this order without its picker and packer.
      // A test order carries no paperwork — it is exempt from the documents gate.
      const saving = testMode ? { ...state, orderNumber: testOrderNumber(state.orderNumber), docsNotRequired: true } : state;
      const result = await triage.save(saving, { intent: 'draft', labelFile });
      if (!result) return null;
      setCreatedIds(result.orderIds);
      savedLines.current = new Map(
        state.lines.map((l, i) => [l.key, { orderId: result.orderIds[i]!, json: JSON.stringify(heldLineBody(l)) }]),
      );
      setState((s) => ({ ...s, orderNumber: result.orderNumber, orderNumberGenerated: false }));
      setLabelFile(null);
      if (!(await commitAssignments(state.lines, result.orderIds, team.byKey))) {
        toast.error('Order saved, but a picker or packer did not save — set it again under Team.');
      }
      // A test order never marks the real Square invoice as imported.
      if (invoice && !testMode) {
        const linked = await fetch('/api/orders/intake/square-invoices/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ orderNumber: result.orderNumber, invoiceId: invoice.invoiceId }),
        }).then((r) => r.ok).catch(() => false);
        if (!linked) toast.error(`Order saved, but Square invoice #${invoice.invoiceNumber} did not link — its payment will not show here.`);
      }
      if (intent === 'release' && (await triage.release(result.orderIds))) finish(result.orderNumber);
      return result.orderNumber;
    },
    [busy, bound, state, triage, createdIds, labelFile, releaseBlockers, draftBlockers, finish, team.byKey, invoice, testMode, syncLines],
  );

  // Leaving with unsaved work asks first.
  useEffect(() => {
    if (!dirty || bound) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty, bound]);

  /* ── Test mode: one press fills the whole order ── */
  const [filling, setFilling] = useState(false);
  const fillTestOrder = useCallback(async () => {
    if (!testMode || bound || filling) return;
    setFilling(true);
    try {
      // A real catalog product, in stock when one is — so pick / QC / pack read a real SKU and bin.
      let hit: IntakeProductHit | null = null;
      for (const q of TEST_FILL_QUERIES) {
        const hits = await searchProducts(q).catch(() => [] as IntakeProductHit[]);
        hit = hits.find((h) => (h.onHand ?? 0) > 0) ?? hit ?? hits[0] ?? null;
        if (hit && (hit.onHand ?? 0) > 0) break;
      }
      if (!hit) toast.error('No catalog product found to fill with — add one on Products.');
      if (mode !== 'new') setMode('new');
      setState((s) => testOrderFill(s, hit, localDateToDateKey(new Date())));
      setStep('payment');
    } finally {
      setFilling(false);
    }
  }, [testMode, bound, filling, mode]);

  /* ── Where each step stands ── */
  const itemCount = state.lines.reduce((n, l) => n + l.quantity, 0);
  const stepDone: Record<CheckoutStepId, boolean> = {
    customer: (state.customer.id != null || Boolean(state.customer.name.trim())) && (!shipToRequired(state) || shipToComplete(state.customer.shipTo)),
    products: state.lines.length > 0,
    team: teamDone,
    order: Boolean(state.orderNumber.trim() && state.channel.trim()),
    shipping:
      state.shippingMode === 'pickup' ||
      (state.shippingMode === 'elsewhere'
        ? Boolean(state.trackingNumber.trim())
        : Boolean(triage.record?.shippingLabelPurchased || triage.record?.shippingLabelLinked)),
    payment: invoice?.status === 'PAID',
  };

  return {
    state,
    patch,
    mode,
    setMode,
    cycleMode,
    choosingImport,
    invoice,
    ecwidOrder,
    importInvoice,
    importEcwidOrder,
    testMode,
    setTestMode,
    fillTestOrder,
    filling,
    step,
    setStep,
    stepIndex,
    goStep,
    nextStep,
    prevStep,
    stepDone,
    channelOptions,
    addProduct,
    addListing,
    setLine,
    removeLine,
    itemCount,
    totals,
    releaseBlockers,
    draftBlockers,
    team,
    triage,
    createdIds,
    bound,
    busy,
    labelFile,
    setLabelFile,
    shelf,
    setShelf,
    toggleShelf,
    submit,
    released,
    startedAt,
    elapsed,
    finishedMs,
  };
}

