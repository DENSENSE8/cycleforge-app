'use client';

/**
 * **Order Intake & Acknowledgment** form body — shadcn-lane chrome.
 * Operator override (2026-08-30, in chat): the intake session is a CENTERED
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Check } from '@/components/Icons';
import { BuyLabelSection } from '@/components/outbound/labels/BuyLabelSection';
import { ConditionPills } from '@/components/receiving/workspace/ConditionPills';
import { StaffButtonGrid, type StaffOption } from '@/components/shipping/StaffButtonGrid';
import { PlatformMark } from '@/components/ui/PlatformMark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { usePlatformCatalog } from '@/hooks/useCatalog';
import {
  emptyCanonicalOrderIntake,
  intakePlatformState,
  rankOrderIntakePlatforms,
  type CanonicalOrderIntake,
  type IntakeFulfillmentChannel,
  type IntakeLabelMode,
} from '@/lib/orders/canonical-order-intake';
import type { EvaluatedReleaseGate } from '@/lib/orders/release-gates';
import { getPresentStaffForToday } from '@/lib/staffCache';
import { SHIPPING_ORDERS_PATH } from '@/lib/shipping/orders-desk';
import { sourcePlatformMeta } from '@/lib/source-platform';
import { saveWorkOrder } from '@/lib/work-orders/saveWorkOrder';
import { staffHasRole } from '@/utils/staff';
import { cn } from '@/utils/_cn';
import { IntakeCombobox } from './IntakeCombobox';
import {
  lookupExistingOrder,
  pairCatalogByItemNumber,
  useOrderTriage,
} from './useOrderTriage';

const SECTIONS = [
  { id: 'identity', label: 'Identity' },
  { id: 'links', label: 'Links' },
  { id: 'documents', label: 'Documents' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'assignment', label: 'Assign' },
  { id: 'review', label: 'Review' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const FULFILLMENT_CHANNEL_OPTIONS = [
  { value: 'shipstation', label: 'ShipStation (buy label)', group: 'Fulfillment channel' },
  { value: 'link_only', label: 'Link existing label only', group: 'Fulfillment channel' },
];

export interface OrderIntakeFormProps {
  /** Order under triage, or `null` to start a new one. */
  orderId: number | null;
  /**
   * Called with the order id the form binds to — a freshly created caged
   * order, or an EXISTING duplicate the operator chose to open instead of
   * inserting a second row.
   */
  onOrderCreated?: (orderId: number) => void;
  /** Called after a successful release, so the host can close the overlay. */
  onReleased?: () => void;
  /**
   * Prefill for the create draft — the CSV staging inspector passes the
   * focused row projected onto `CanonicalOrderIntake`. Read once on mount;
   * hosts remount (key) per row.
   */
  initialDraft?: Partial<CanonicalOrderIntake>;
  /**
   * Fired on every draft change while unbound, so the staging inspector can
   * write canonical edits back onto its staged row. Single-density hosts omit
   * it.
   */
  onDraftChange?: (draft: CanonicalOrderIntake) => void;
}

export function OrderIntakeForm({
  orderId,
  onOrderCreated,
  onReleased,
  initialDraft,
  onDraftChange,
}: OrderIntakeFormProps) {
  const router = useRouter();
  // A just-created order binds LOCALLY first: the `?triage=<id>` URL replace
  // arrives a tick later, and rendering the blank create form in that window
  // reads as "my order vanished". The prop wins once the host catches up.
  const [createdId, setCreatedId] = useState<number | null>(null);
  const boundOrderId = orderId ?? createdId;
  const triage = useOrderTriage(boundOrderId);
  const fieldId = useId();
  const [draft, setDraft] = useState<CanonicalOrderIntake>(() => ({
    ...emptyCanonicalOrderIntake(),
    ...initialDraft,
  }));
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});

  const record = triage.record;
  const gates = record?.gates;
  const released = record?.releaseState === 'released';

  /* ── Identity acknowledgment state ─────────────────────────────────── */
  const platformState = intakePlatformState(boundOrderId ? record?.orderNumber : draft.orderNumber);
  const platformCatalog = usePlatformCatalog();
  const platformOptions = useMemo(
    () =>
      rankOrderIntakePlatforms(platformCatalog.options ?? []).map((o) => ({
        value: o.value,
        label: o.label,
        group: 'Platforms',
      })),
    [platformCatalog.options],
  );

  const [duplicate, setDuplicate] = useState<{ id: number; orderNumber: string } | null>(null);
  const [paired, setPaired] = useState<{ sku: string; productTitle: string } | null>(null);

  /* ── Shipping state ────────────────────────────────────────────────── */
  const [labelMode, setLabelMode] = useState<IntakeLabelMode>(
    initialDraft?.labelMode ?? 'link',
  );
  const [channel, setChannel] = useState<IntakeFulfillmentChannel>(
    initialDraft?.fulfillmentChannel ?? 'shipstation',
  );
  /** Named reason ShipStation cannot buy right now (`null` = no known blocker). */
  const [shipstationDown, setShipstationDown] = useState<string | null>(null);
  const numToText = (v: number | null | undefined) => (v == null ? '' : String(v));
  const [weightText, setWeightText] = useState(numToText(initialDraft?.weightOz));
  const [dimLText, setDimLText] = useState(numToText(initialDraft?.dimL));
  const [dimWText, setDimWText] = useState(numToText(initialDraft?.dimW));
  const [dimHText, setDimHText] = useState(numToText(initialDraft?.dimH));

  /* ── Assignment state ──────────────────────────────────────────────── */
  const [techOptions, setTechOptions] = useState<StaffOption[]>([]);
  const [packerOptions, setPackerOptions] = useState<StaffOption[]>([]);
  const [techId, setTechId] = useState<number | null>(initialDraft?.assignedTechId ?? null);
  const [packerId, setPackerId] = useState<number | null>(
    initialDraft?.assignedPackerId ?? null,
  );
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const staffLoadedRef = useRef(false);

  const setField = useCallback(
    (key: keyof CanonicalOrderIntake) => (value: string) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    [],
  );

  // Bulk density write-back: the staging inspector applies these edits onto
  // its staged row. Only meaningful while the draft IS the record (unbound).
  useEffect(() => {
    if (boundOrderId) return;
    onDraftChange?.(draft);
  }, [draft, boundOrderId, onDraftChange]);

  // Once bound, initialize the parcel inputs from the stored order — the DB is the SoT the rate-shop reads.
  const parcelSyncedForId = useRef<number | null>(null);
  const parcelTouched = useRef(false);
  useEffect(() => {
    if (!record?.id || parcelSyncedForId.current === record.id) return;
    parcelSyncedForId.current = record.id;
    if (parcelTouched.current) return;
    setWeightText(numToText(record.parcelWeightOz));
    setDimLText(numToText(record.parcelLengthIn));
    setDimWText(numToText(record.parcelWidthIn));
    setDimHText(numToText(record.parcelHeightIn));
  }, [record]);
  const touchParcel = useCallback((set: (value: string) => void) => (value: string) => {
    parcelTouched.current = true;
    set(value);
  }, []);

  // Present staff for the Assignment pickers — loaded once the section can be
  // used (an order exists to assign against).
  useEffect(() => {
    if (!boundOrderId || staffLoadedRef.current) return;
    staffLoadedRef.current = true;
    getPresentStaffForToday()
      .then((members) => {
        setTechOptions(
          members
            .filter((m) => staffHasRole(m, 'technician'))
            .map((m) => ({ id: Number(m.id), name: m.name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
        setPackerOptions(
          members
            .filter((m) => staffHasRole(m, 'packer'))
            .map((m) => ({ id: Number(m.id), name: m.name }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        );
      })
      .catch(() => {
        /* proceed with empty lists — the grids state their own emptiness */
      });
  }, [boundOrderId]);

  const jumpTo = useCallback((id: SectionId) => {
    // `scrollIntoView` moves the SCROLL PORT, not the section — no geometry is
    // animated and no neighbour moves, so this stays inside the no-layout-tween
    // law. `block: 'start'` lands the heading at the top of the port.
    sectionRefs.current[id]?.scrollIntoView({ block: 'start' });
  }, []);

  /* ── Identity actions ──────────────────────────────────────────────── */

  // Blur lookups are async and un-cancellable; a slow response for the
  // PREVIOUS value must never overwrite state derived from the current one.
  // Each fire bumps the sequence; only the latest is allowed to land.
  const duplicateSeq = useRef(0);
  const pairSeq = useRef(0);

  const acknowledgeOrderNumber = useCallback(async () => {
    const seq = ++duplicateSeq.current;
    const q = draft.orderNumber.trim();
    if (!q) {
      setDuplicate(null);
      return;
    }
    const existing = await lookupExistingOrder(q);
    if (duplicateSeq.current !== seq) return; // superseded by a newer blur
    setDuplicate(existing);
  }, [draft.orderNumber]);

  const pairItemNumber = useCallback(async () => {
    const seq = ++pairSeq.current;
    const q = draft.itemNumber.trim();
    if (!q) {
      setPaired(null);
      return;
    }
    const catalog = await pairCatalogByItemNumber(q);
    if (pairSeq.current !== seq) return; // superseded by a newer blur
    setPaired(catalog);
    if (!catalog) return;
    // Fill, never overwrite: the pair completes what the operator has not
    // typed and leaves everything they have — and only if the item number the
    // response answered is still the one on the draft.
    setDraft((prev) => {
      if (prev.itemNumber.trim() !== q) return prev;
      return {
        ...prev,
        sku: prev.sku.trim() ? prev.sku : catalog.sku,
        productTitle: prev.productTitle.trim() ? prev.productTitle : catalog.productTitle,
      };
    });
  }, [draft.itemNumber]);

  const handleStartTriage = useCallback(async () => {
    const newId = await triage.createCaged({
      ...draft,
      fulfillmentChannel: channel,
      labelMode,
      weightOz: parsePositive(weightText),
      dimL: parsePositive(dimLText),
      dimW: parsePositive(dimWText),
      dimH: parsePositive(dimHText),
    });
    if (newId) {
      // Bind locally FIRST — the host's URL replace lands a tick later, and
      // that gap must show the bound session, not a blank create form.
      setCreatedId(newId);
      onOrderCreated?.(newId);
      setDraft(emptyCanonicalOrderIntake());
      setDuplicate(null);
      setPaired(null);
    }
  }, [channel, dimHText, dimLText, dimWText, draft, labelMode, onOrderCreated, triage, weightText]);

  const handleRelease = useCallback(() => {
    triage.release();
  }, [triage]);

  /* ── Shipping actions ──────────────────────────────────────────────── */

  const currentWeightOz = parsePositive(weightText) ?? record?.parcelWeightOz ?? null;
  const currentDims = useMemo(() => {
    const l = parsePositive(dimLText) ?? record?.parcelLengthIn ?? null;
    const w = parsePositive(dimWText) ?? record?.parcelWidthIn ?? null;
    const h = parsePositive(dimHText) ?? record?.parcelHeightIn ?? null;
    return l != null && w != null && h != null
      ? { length: l, width: w, height: h, unit: 'inch' as const }
      : null;
  }, [dimLText, dimWText, dimHText, record]);

  const commitParcel = useCallback(() => {
    if (!boundOrderId) {
      // Unbound: the parcel lives on the draft until Start triage lands it.
      setDraft((prev) => ({
        ...prev,
        weightOz: parsePositive(weightText),
        dimL: parsePositive(dimLText),
        dimW: parsePositive(dimWText),
        dimH: parsePositive(dimHText),
      }));
      return;
    }
    triage.setParcel({
      weightOz: parsePositive(weightText),
      lengthIn: parsePositive(dimLText),
      widthIn: parsePositive(dimWText),
      heightIn: parsePositive(dimHText),
    });
  }, [dimHText, dimLText, dimWText, boundOrderId, triage, weightText]);

  const handleRatesError = useCallback(
    (info: { code: string | null; message: string }) => {
      if (info.code !== 'SHIPSTATION_NOT_CONNECTED') return;
      setShipstationDown(
        'ShipStation is not connected — connect it in Settings → Integrations, or link an existing label.',
      );
      setChannel('link_only');
      setLabelMode('link');
    },
    [],
  );

  const buyBlockedReason = !boundOrderId
    ? 'Start triage first — buying a label needs the order.'
    : shipstationDown
      ? shipstationDown
      : channel === 'link_only'
        ? 'Fulfillment channel is link-only. Switch it to ShipStation to buy.'
        : currentWeightOz == null
          ? 'Add a parcel weight — carriers cannot rate a 0 oz parcel.'
          : null;

  /* ── Assignment actions ────────────────────────────────────────────── */

  const persistAssignment = useCallback(
    async (nextTechId: number | null, nextPackerId: number | null) => {
      if (!boundOrderId) return;
      setAssignSaving(true);
      setAssignError(null);
      try {
        // Existing write path: PATCH /api/work-orders upserts the TEST row
        // (tech slot) and — because the packer key is present — the PACK row.
        // Queue tester/packer names project from those work_assignments.
        await saveWorkOrder({
          entityType: 'ORDER',
          entityId: boundOrderId,
          assignedTechId: nextTechId,
          assignedPackerId: nextPackerId,
          status: nextTechId != null ? 'ASSIGNED' : 'OPEN',
          priority: 100,
          deadlineAt: null,
        });
      } catch (err) {
        setAssignError(err instanceof Error ? err.message : 'Failed to save assignment');
      } finally {
        setAssignSaving(false);
      }
    },
    [boundOrderId],
  );

  const selectTech = useCallback(
    (id: number) => {
      const next = techId === id ? null : id;
      setTechId(next);
      void persistAssignment(next, packerId);
    },
    [packerId, persistAssignment, techId],
  );

  const selectPacker = useCallback(
    (id: number) => {
      const next = packerId === id ? null : id;
      setPackerId(next);
      void persistAssignment(techId, next);
    },
    [packerId, persistAssignment, techId],
  );

  /** Released is a terminal state for this form: */
  const releaseBaseline = useRef<'unseeded' | 'released' | 'not-released'>('unseeded');
  useEffect(() => {
    // Rebinding to a different order restarts the observation.
    releaseBaseline.current = 'unseeded';
  }, [boundOrderId]);
  useEffect(() => {
    if (!record || record.id !== boundOrderId) return;
    if (releaseBaseline.current === 'unseeded') {
      releaseBaseline.current = released ? 'released' : 'not-released';
      return;
    }
    if (released && releaseBaseline.current === 'not-released') {
      releaseBaseline.current = 'released';
      onReleased?.();
    }
  }, [record, released, boundOrderId, onReleased]);

  /**
   * Open this order's own details panel, where `OrderDocumentsSection` mounts
   * the document tray — the existing attach/link path. Re-check re-reads the
   * gates when the operator comes back.
   */
  const openLabelsWorkbench = useCallback(() => {
    if (!boundOrderId) return;
    router.push(`${SHIPPING_ORDERS_PATH}?openOrderId=${boundOrderId}`);
  }, [boundOrderId, router]);

  const gateById = useMemo(() => {
    const map = new Map<string, EvaluatedReleaseGate>();
    for (const gate of gates?.gates ?? []) map.set(gate.id, gate);
    return map;
  }, [gates]);

  const registerSection = useCallback(
    (id: SectionId) => (node: HTMLElement | null) => {
      sectionRefs.current[id] = node;
    },
    [],
  );

  const inferredMeta = platformState.inferred
    ? sourcePlatformMeta(platformState.inferred)
    : null;
  const startBlocked =
    duplicate != null
    || (platformState.requiresChoice && !draft.platformChosen.trim());

  return (
    // `order-intake-form` is the acknowledgment surface's own id;
    // `order-triage-form` stays on the inner root so every pre-existing
    // locator keeps resolving. Same DOM, two names, zero forked markup.
    <div className="flex h-full min-h-0 flex-col" data-testid="order-intake-form">
      <div className="flex h-full min-h-0 flex-col" data-testid="order-triage-form">
        <nav
          aria-label="Intake sections"
          className="flex shrink-0 items-stretch gap-0 border-b border-border-hairline bg-surface-card"
        >
          {SECTIONS.map((section) => {
            const enabled = section.id === 'identity' || Boolean(boundOrderId);
            return (
              <Button
                key={section.id}
                variant="ghost"
                size="sm"
                disabled={!enabled}
                onClick={() => jumpTo(section.id)}
                data-testid={`triage-jump-${section.id}`}
                className="h-8 flex-1"
              >
                {section.label}
              </Button>
            );
          })}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* ── 1. Identity ─────────────────────────────────────────────── */}
          <IntakeSection id="identity" title="Identity" registerRef={registerSection('identity')}>
            {boundOrderId ? (
              <div className="space-y-3 px-5 py-4">
                <PlatformAcknowledgeRow
                  inferredLabel={inferredMeta?.label ?? null}
                  inferredValue={platformState.inferred}
                />
                <dl className="divide-y divide-border-hairline border-y border-border-hairline">
                  <IdentityRow label="Order number" value={record?.orderNumber} mono />
                  {/* Item number and SKU sit ADJACENT on purpose. */}
                  <IdentityRow
                    label="Item number"
                    value={record?.itemNumber}
                    mono
                    pairedWith={record?.sku}
                  />
                  <IdentityRow
                    label="SKU"
                    value={record?.sku}
                    mono
                    pairedWith={record?.itemNumber}
                  />
                  <IdentityRow label="Title" value={record?.productTitle} />
                  <IdentityRow label="Quantity" value={record?.quantity} />
                  <IdentityRow label="Condition" value={record?.condition} />
                  <IdentityRow label="Source" value={record?.accountSource} />
                </dl>
              </div>
            ) : (
              <div className="space-y-4 px-5 py-4">
                <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={`${fieldId}-order-number`}>Order number</Label>
                    <Input
                      id={`${fieldId}-order-number`}
                      value={draft.orderNumber}
                      onChange={(e) => {
                        setDuplicate(null);
                        setField('orderNumber')(e.target.value);
                      }}
                      onBlur={() => void acknowledgeOrderNumber()}
                      className="font-mono"
                      data-testid="intake-order-number"
                    />
                    <PlatformAcknowledgeRow
                      inferredLabel={inferredMeta?.label ?? null}
                      inferredValue={platformState.inferred}
                      origin={draft.importOrigin}
                    />
                  </div>

                  {duplicate ? (
                    <div className="flex items-center justify-between gap-2 border border-border-warning bg-surface-warning px-3 py-2 sm:col-span-2">
                      <p className="min-w-0 text-role-caption text-text-warning" role="status">
                        This org already has order{' '}
                        <span className="font-mono font-semibold">{duplicate.orderNumber}</span>
                        {' '}— it will not be inserted twice.
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onOrderCreated?.(duplicate.id)}
                        data-testid="intake-open-existing"
                      >
                        Open it
                      </Button>
                    </div>
                  ) : null}

                  {platformState.requiresChoice ? (
                    <div className="space-y-1.5">
                      <Label htmlFor={`${fieldId}-platform-chosen`}>Platform</Label>
                      <IntakeCombobox
                        triggerId={`${fieldId}-platform-chosen`}
                        value={draft.platformChosen || null}
                        onChange={(value) => setField('platformChosen')(value)}
                        options={platformOptions}
                        placeholder="Search or select…"
                        searchPlaceholder="Type to filter…"
                        emptyMessage="No platforms match"
                        ariaLabel="Platform"
                        testId="intake-platform-chosen"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-1.5">
                    <Label htmlFor={`${fieldId}-channel`}>Fulfillment channel</Label>
                    <IntakeCombobox
                      triggerId={`${fieldId}-channel`}
                      value={channel}
                      onChange={(value) => {
                        setChannel(value as IntakeFulfillmentChannel);
                        if (value === 'shipstation') setShipstationDown(null);
                        setDraft((prev) => ({
                          ...prev,
                          fulfillmentChannel: value as IntakeFulfillmentChannel,
                        }));
                      }}
                      options={FULFILLMENT_CHANNEL_OPTIONS}
                      placeholder="Search or select…"
                      searchPlaceholder="Type to filter…"
                      emptyMessage="No channels match"
                      ariaLabel="Fulfillment channel"
                      testId="intake-fulfillment-channel"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`${fieldId}-item-number`}>Item number</Label>
                    <Input
                      id={`${fieldId}-item-number`}
                      value={draft.itemNumber}
                      onChange={(e) => {
                        setPaired(null);
                        setField('itemNumber')(e.target.value);
                      }}
                      onBlur={() => void pairItemNumber()}
                      className="font-mono"
                      data-testid="intake-item-number"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`${fieldId}-sku`}>SKU</Label>
                    <Input
                      id={`${fieldId}-sku`}
                      value={draft.sku}
                      onChange={(e) => setField('sku')(e.target.value)}
                      className="font-mono"
                      data-testid="intake-sku"
                    />
                  </div>

                  {paired ? (
                    <p className="text-role-caption text-text-success sm:col-span-2" role="status">
                      Paired to catalog: <span className="font-mono">{paired.sku}</span>
                      {paired.productTitle ? ` · ${paired.productTitle}` : ''}
                    </p>
                  ) : null}

                  <div className="space-y-1.5">
                    <Label htmlFor={`${fieldId}-title`}>Title</Label>
                    <Input
                      id={`${fieldId}-title`}
                      value={draft.productTitle}
                      onChange={(e) => setField('productTitle')(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor={`${fieldId}-qty`}>Quantity</Label>
                    <div data-testid="intake-qty">
                      <Input
                        id={`${fieldId}-qty`}
                        type="number"
                        min={1}
                        step={1}
                        value={draft.quantity}
                        onChange={(e) => setField('quantity')(e.target.value)}
                        onBlur={() => {
                          // Deferred clamp: commit a whole number ≥ 1, revert junk.
                          const parsed = parseInt(draft.quantity, 10);
                          setField('quantity')(
                            String(Number.isFinite(parsed) ? Math.max(1, parsed) : 1),
                          );
                        }}
                        className="w-28"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    {/* Group heading, not a form label — the pills are their own radiogroup. */}
                    <p className="text-role-micro font-semibold uppercase tracking-wide text-text-soft">
                      Condition
                    </p>
                    <ConditionPills
                      value={draft.condition}
                      onChange={(next) => setField('condition')(next)}
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor={`${fieldId}-tracking`}>Tracking number</Label>
                    <Input
                      id={`${fieldId}-tracking`}
                      value={draft.trackingNumbers[0] ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          trackingNumbers: e.target.value.trim() ? [e.target.value] : [],
                        }))
                      }
                      className="font-mono"
                    />
                  </div>
                </div>

                <Separator />

                <div>
                  <Button
                    variant="default"
                    size="md"
                    disabled={startBlocked || triage.creating}
                    onClick={() => void handleStartTriage()}
                    data-testid="triage-start"
                  >
                    {triage.creating ? 'Starting…' : 'Start triage'}
                  </Button>
                  {duplicate ? (
                    <p className="pt-2 text-role-caption text-text-warning">
                      That order already exists — open it above instead of creating a twin.
                    </p>
                  ) : platformState.requiresChoice && !draft.platformChosen.trim() ? (
                    <p className="pt-2 text-role-caption text-text-danger">
                      Pick a platform — this order number&rsquo;s shape doesn&rsquo;t name one.
                    </p>
                  ) : (
                    <p className="pt-2 text-role-caption text-text-soft">
                      Creates the order <strong>caged</strong> — it stays out of the To-ship
                      queue until all three gates below are green.
                    </p>
                  )}
                </div>
              </div>
            )}
          </IntakeSection>

          {/* ── 2. Links (G1) ───────────────────────────────────────────── */}
          <IntakeSection
            id="links"
            title="Links"
            gate={gateById.get('G1')}
            registerRef={registerSection('links')}
          >
            <div className="space-y-3 px-5 py-4">
              <dl className="divide-y divide-border-hairline border-y border-border-hairline">
                <IdentityRow label="Item number" value={record?.itemNumber} mono />
                <IdentityRow label="Order number" value={record?.orderNumber} mono />
                <IdentityRow label="Tracking number" value={record?.trackingNumber} mono />
              </dl>
              <p className="text-role-caption text-text-soft">
                All three must be present and on this record. Tracking is registered from the
                order&rsquo;s own tracking field — add it on the order to close this gate.
              </p>
            </div>
          </IntakeSection>

          {/* ── 3. Documents (G2) ───────────────────────────────────────── */}
          <IntakeSection
            id="documents"
            title="Documents"
            gate={gateById.get('G2')}
            registerRef={registerSection('documents')}
          >
            <div className="space-y-3 px-5 py-4">
              <p className="text-role-caption text-text-soft">
                {record
                  ? `${record.linkedDocumentCount} document${record.linkedDocumentCount === 1 ? '' : 's'} linked to this item.`
                  : 'No order yet.'}
              </p>
              <div className={cn('flex items-start gap-2.5', !boundOrderId && 'opacity-50')}>
                <Checkbox
                  id={`${fieldId}-docs-exempt`}
                  checked={record?.docsNotRequired ?? false}
                  disabled={!boundOrderId || triage.savingDocsFlag || released}
                  onCheckedChange={(next) => triage.setDocsNotRequired(next === true)}
                  data-testid="triage-docs-not-required"
                  className="mt-0.5"
                />
                <label htmlFor={`${fieldId}-docs-exempt`} className="min-w-0 cursor-pointer">
                  <span className="block text-role-body text-text-default">
                    Item number does not require documents
                  </span>
                  <span className="block text-role-caption text-text-soft">
                    An explicit decision, not an absence. It is recorded on the order and shown
                    in the release audit.
                  </span>
                </label>
              </div>
            </div>
          </IntakeSection>

          {/* ── 4. Shipping (G3) ────────────────────────────────────────── */}
          <IntakeSection
            id="shipping"
            title="Shipping"
            gate={gateById.get('G3')}
            registerRef={registerSection('shipping')}
          >
            <div className="space-y-4 px-5 py-4">
              {/* Parcel — weight + dims persist on the order and ride the rate
                  request (dim-weight pricing). Commit on blur/Enter. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ParcelField
                  id={`${fieldId}-weight`}
                  label="Weight oz"
                  value={weightText}
                  onChange={touchParcel(setWeightText)}
                  onCommit={commitParcel}
                  testId="intake-weight"
                />
                <ParcelField
                  id={`${fieldId}-dim-l`}
                  label="L in"
                  value={dimLText}
                  onChange={touchParcel(setDimLText)}
                  onCommit={commitParcel}
                  testId="intake-dim-l"
                />
                <ParcelField
                  id={`${fieldId}-dim-w`}
                  label="W in"
                  value={dimWText}
                  onChange={touchParcel(setDimWText)}
                  onCommit={commitParcel}
                  testId="intake-dim-w"
                />
                <ParcelField
                  id={`${fieldId}-dim-h`}
                  label="H in"
                  value={dimHText}
                  onChange={touchParcel(setDimHText)}
                  onCommit={commitParcel}
                  testId="intake-dim-h"
                />
              </div>
              {triage.savingParcel ? (
                <p className="text-role-micro text-text-faint">Saving parcel…</p>
              ) : null}

              <p className="text-role-caption text-text-soft">
                {record?.shippingLabelPurchased
                  ? 'Label bought through the existing label path.'
                  : record?.shippingLabelLinked
                    ? 'Label linked to this order.'
                    : 'No shipping label on this order yet.'}
              </p>

              {/* Link vs Buy — one mode, two panes; the buy pane COMPOSES the
                  existing BuyLabelSection (never a second engine). */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={labelMode === 'link' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setLabelMode('link')}
                  data-testid="intake-label-link"
                >
                  Link label
                </Button>
                <Button
                  variant={labelMode === 'buy' ? 'default' : 'outline'}
                  size="sm"
                  disabled={buyBlockedReason != null}
                  onClick={() => setLabelMode('buy')}
                  data-testid="intake-label-buy-toggle"
                >
                  Buy label
                </Button>
                {buyBlockedReason ? (
                  <p className="w-full text-role-caption text-text-warning" role="status">
                    {buyBlockedReason}
                  </p>
                ) : null}
              </div>

              {labelMode === 'buy' && boundOrderId && buyBlockedReason == null ? (
                <div
                  className="border border-border-hairline p-3"
                  data-testid="intake-label-buy"
                >
                  <BuyLabelSection
                    orderId={boundOrderId}
                    orderRef={record?.orderNumber ?? `#${boundOrderId}`}
                    flush
                    weightOz={currentWeightOz}
                    dimensions={currentDims}
                    onChange={triage.refresh}
                    onRatesError={handleRatesError}
                  />
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!boundOrderId}
                    onClick={openLabelsWorkbench}
                    data-testid="triage-open-labels"
                  >
                    Link or buy a label
                  </Button>
                  <Button variant="ghost" size="sm" onClick={triage.refresh} disabled={!boundOrderId}>
                    Re-check
                  </Button>
                </div>
              )}
              <p className="text-role-caption text-text-soft">
                Buying rate-shops the existing ShipStation engine with this parcel&rsquo;s
                weight and dimensions. Linking attaches a label that already exists. Either
                closes G3 — Re-check re-reads the gates.
              </p>
            </div>
          </IntakeSection>

          {/* ── 5. Assignment (not a gate) ──────────────────────────────── */}
          <IntakeSection
            id="assignment"
            title="Assignment"
            registerRef={registerSection('assignment')}
          >
            {!boundOrderId ? (
              <p className="px-5 py-4 text-role-caption text-text-soft">
                Start triage above to assign who fulfills and who packs.
              </p>
            ) : (
              <div className="space-y-3 px-5 py-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div data-testid="intake-assign-tech">
                    <StaffButtonGrid
                      label="Fulfillment / test"
                      options={techOptions}
                      selectedId={techId}
                      onSelect={selectTech}
                      columns={2}
                      emptyMessage="No technicians present today"
                    />
                  </div>
                  <div data-testid="intake-assign-packer">
                    <StaffButtonGrid
                      label="Pack"
                      options={packerOptions}
                      selectedId={packerId}
                      onSelect={selectPacker}
                      columns={2}
                      emptyMessage="No packers present today"
                    />
                  </div>
                </div>
                {assignError ? (
                  <p className="text-role-caption text-text-danger">{assignError}</p>
                ) : null}
                {assignSaving ? (
                  <p className="text-role-micro text-text-faint">Saving…</p>
                ) : null}
                <p className="text-role-caption text-text-soft">
                  Operational, not a gate — unassigned work is valid and Release does not wait
                  on it.
                </p>
              </div>
            )}
          </IntakeSection>

          {/* ── 6. Review / Release ─────────────────────────────────────── */}
          <IntakeSection id="review" title="Review" registerRef={registerSection('review')}>
            {!boundOrderId ? (
              <p className="px-5 py-4 text-role-caption text-text-soft">
                Start triage above to evaluate the release gates.
              </p>
            ) : (
              <div className="space-y-3 px-5 py-4">
                <ul className="divide-y divide-border-hairline border-y border-border-hairline">
                  {(gates?.gates ?? []).map((gate) => (
                    <li key={gate.id} className="flex items-start gap-2.5 px-3 py-2.5">
                      <GateBadge passed={gate.passed} />
                      <span className="min-w-0">
                        <span className="block text-role-body text-text-default">
                          {gate.id} · {gate.label}
                        </span>
                        {gate.reason ? (
                          <span className="block text-role-caption text-text-soft">
                            {gate.reason}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
                <div>
                  {released ? (
                    <p className="text-role-body font-semibold text-text-success">
                      Released — this order is in the To-ship queue.
                    </p>
                  ) : (
                    <>
                      <Button
                        variant="default"
                        size="md"
                        disabled={!gates?.canRelease || triage.releasing}
                        onClick={handleRelease}
                        data-testid="triage-release"
                      >
                        {triage.releasing ? 'Releasing…' : 'Release'}
                      </Button>
                      {/*
                        The plan forbids a silently-disabled Release, so the
                        blockers are printed next to it — the checklist above
                        says WHICH, this says THAT.
                      */}
                      {!gates?.canRelease && gates ? (
                        <p className="pt-2 text-role-caption text-text-danger" role="status">
                          Blocked by {gates.failing.map((gate) => gate.id).join(', ')}.
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            )}
          </IntakeSection>
        </div>
      </div>
    </div>
  );
}

function parsePositive(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The Identity acknowledgment row: the platform the order number itself
 * names, painted with the house `PlatformMark` — or an honest dash when the
 * shape names nothing. Never a second copy of the inference rule.
 */
function PlatformAcknowledgeRow({
  inferredValue,
  inferredLabel,
  origin,
}: {
  inferredValue: 'amazon' | 'ebay' | null;
  inferredLabel: string | null;
  origin?: string;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 pt-1"
      data-testid="intake-platform-inferred"
    >
      {/* Read-only acknowledgment line — a heading, not a control label. */}
      <span className="text-role-micro font-semibold uppercase tracking-wide text-text-soft">
        Platform
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        {inferredValue ? (
          <>
            <PlatformMark platformValue={inferredValue} />
            <span className="truncate text-role-caption font-semibold text-text-default">
              {inferredLabel}
            </span>
            <span className="shrink-0 text-role-micro text-text-faint">from the number</span>
          </>
        ) : (
          <span className="text-role-caption text-text-faint">—</span>
        )}
        {origin ? (
          <Badge variant="secondary" className="ml-2">
            {origin === 'csv' ? 'CSV row' : 'Manual entry'}
          </Badge>
        ) : null}
      </span>
    </div>
  );
}

/** Labeled numeric parcel cell (commit on blur/Enter). */
function ParcelField({
  id,
  label,
  value,
  onChange,
  onCommit,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  testId: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode="decimal"
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        data-testid={testId}
      />
    </div>
  );
}

function IntakeSection({
  id,
  title,
  gate,
  registerRef,
  children,
}: {
  id: SectionId;
  title: string;
  gate?: EvaluatedReleaseGate;
  registerRef: (node: HTMLElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <section ref={registerRef} data-intake-section={id} className="scroll-mt-0">
      <header className="sticky top-0 z-raised flex items-center justify-between gap-2 border-b border-border-hairline bg-surface-card px-5 py-2">
        <h3 className="text-role-eyebrow font-semibold uppercase tracking-widest text-text-soft">
          {title}
        </h3>
        {gate ? <GateBadge passed={gate.passed} withLabel /> : null}
      </header>
      {children}
    </section>
  );
}

/** Colour + glyph, never colour alone — the gate state must survive a mono display. */
function GateBadge({ passed, withLabel = false }: { passed: boolean; withLabel?: boolean }) {
  return (
    <Badge variant={passed ? 'success' : 'destructive'}>
      {passed ? <Check aria-hidden /> : <AlertCircle aria-hidden />}
      <span className={withLabel ? undefined : 'sr-only'}>{passed ? 'Green' : 'Blocked'}</span>
    </Badge>
  );
}

function IdentityRow({
  label,
  value,
  mono = false,
  pairedWith,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  /**
   * The counterpart key this row is read against (item number ↔ SKU). When
   * both are present and differ, the row is marked — glyph + text, never
   * colour alone, so the flag survives a mono display.
   */
  pairedWith?: string | null;
}) {
  const present = typeof value === 'string' && value.trim().length > 0;
  const counterpart = typeof pairedWith === 'string' ? pairedWith.trim() : '';
  const differs =
    present && counterpart.length > 0 && counterpart !== (value ?? '').trim();
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-2">
      <dt className="shrink-0 text-role-caption text-text-soft">{label}</dt>
      <dd
        className={cn(
          'flex min-w-0 items-baseline justify-end gap-1.5 text-right text-role-body',
          present ? 'text-text-default' : 'text-text-faint',
        )}
      >
        <span className={cn('min-w-0 truncate', mono && 'font-mono')}>
          {present ? value : '—'}
        </span>
        {differs ? (
          <Badge variant="warning" className="shrink-0">
            <AlertCircle aria-hidden />
            differs
          </Badge>
        ) : null}
      </dd>
    </div>
  );
}
