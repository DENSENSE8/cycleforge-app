'use client';

/** Local pickup intake for the kiosk: catalog first, then a compact reviewed PICKUP draft. */

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Button } from '@/design-system/primitives';
import { Camera, Check, ExternalLink, Plus, Printer, Trash2 } from '@/components/Icons';
import {
  ProductSelector,
  type ProductSelection,
  type SelectedItem,
} from '@/components/repair/ProductSelector';
import { KioskPaneForm } from '@/components/kiosk/KioskPaneForm';
import { KioskEntryField } from '@/components/kiosk/KioskEntryField';
import { KioskStepTitleRow } from '@/components/kiosk/KioskStepTitleRow';
import { IntakeCombobox } from '@/components/outbound/orders/intake/IntakeCombobox';
import { KIOSK_META, KIOSK_SECTION_LABEL_ROW, KIOSK_TILE_TITLE } from '@/app/kiosk/kiosk-chrome';
import { KIOSK_POS_CTA } from '@/app/kiosk/kiosk-pos-surface';
import { MOBILE_SCAN_ROW_CORNER } from '@/design-system/tokens/radius';
import {
  createKioskPickupDraft,
  kioskPickupReady,
  syncKioskPickupProducts,
} from '@/lib/kiosk/local-pickup-draft';
import type { InboundOrderDraft, InboundOrderLine } from '@/lib/inbound/inbound-order-draft';
import type { IngestInboundOrderResult } from '@/lib/inbound/ingest-inbound-order';
import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { printProductLabel } from '@/lib/print/printProductLabel';
import { localDateToDateKey } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { readFileAsDataUrl } from '@/lib/inbound/inbound-order-client';
import {
  KioskPaymentStepUpSheet,
  type KioskPaymentStepUpResult,
} from '@/components/kiosk/KioskPaymentStepUpSheet';

type Phase = 'browse' | 'details' | 'items' | 'review' | 'done';

interface VendorOption {
  id: number;
  name: string;
}

interface KioskIssuedLabel {
  serialUnitId: number;
  unitUid: string;
  sku: string;
  title: string;
  serialNumber: string | null;
  condition: string | null;
  qrPayload: string;
}

interface LabelPrintSummary {
  printed: number;
  failedLines: number;
}

const CONDITION_OPTIONS = [
  { value: 'BRAND_NEW', label: 'Brand new' },
  { value: 'USED_A', label: 'Used · Grade A' },
  { value: 'USED_B', label: 'Used · Grade B' },
  { value: 'USED_C', label: 'Used · Grade C' },
  { value: 'PARTS', label: 'Parts' },
] as const;

const PARTS_OPTIONS = [
  { value: 'COMPLETE', label: 'Complete' },
  { value: 'MISSING_PARTS', label: 'Missing parts' },
] as const;

function centsText(cents: number | null | undefined): string {
  return cents == null ? '' : (cents / 100).toFixed(2);
}

function inputCents(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

function patchLine(
  draft: InboundOrderDraft,
  index: number,
  patch: Partial<InboundOrderLine>,
): InboundOrderDraft {
  return {
    ...draft,
    lines: draft.lines.map((line, lineIndex) =>
      lineIndex === index ? { ...line, ...patch } : line,
    ),
  };
}

function lineTotal(line: InboundOrderLine): number {
  return (line.quantity ?? 0) * (line.unitCostCents ?? 0);
}

function KioskPickupLineCard({
  line,
  index,
  canRemove,
  onPatch,
  onRemove,
}: {
  line: InboundOrderLine;
  index: number;
  canRemove: boolean;
  onPatch: (patch: Partial<InboundOrderLine>) => void;
  onRemove: () => void;
}) {
  const [priceText, setPriceText] = useState(() => centsText(line.unitCostCents));
  return (
    <section
      className={cn(
        'flex flex-col gap-3 border border-border-hairline bg-surface-card px-4 py-3',
        MOBILE_SCAN_ROW_CORNER,
      )}
      data-testid="kiosk-pickup-item"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={KIOSK_TILE_TITLE}>{line.title || `Product ${index + 1}`}</p>
          {line.sku ? <p className={cn('mt-0.5', KIOSK_META)}>{line.sku}</p> : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<Trash2 className="h-4 w-4" />}
          disabled={!canRemove}
          onClick={onRemove}
          aria-label={`Remove ${line.title || `product ${index + 1}`}`}
        >
          Remove
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <KioskEntryField
          name="Product name"
          idScope={line.lineKey}
          value={line.title}
          onChange={(title) => onPatch({ title })}
          testId={`kiosk-pickup-title-${index}`}
        />
        <KioskEntryField
          name="SKU (optional)"
          idScope={line.lineKey}
          value={line.sku}
          onChange={(sku) => onPatch({ sku, skuCatalogId: null })}
          testId={`kiosk-pickup-sku-${index}`}
        />
        <KioskEntryField
          name="Quantity"
          idScope={line.lineKey}
          value={line.quantity == null ? '' : String(line.quantity)}
          inputMode="numeric"
          onChange={(raw) => {
            const quantity = Number(raw);
            onPatch({
              quantity:
                raw.trim() && Number.isInteger(quantity) && quantity > 0 && quantity <= 10_000
                  ? quantity
                  : null,
            });
          }}
          testId={`kiosk-pickup-quantity-${index}`}
        />
        <KioskEntryField
          name="Price each"
          idScope={line.lineKey}
          value={priceText}
          inputMode="decimal"
          onChange={(raw) => {
            setPriceText(raw);
            onPatch({ unitCostCents: inputCents(raw) });
          }}
          testId={`kiosk-pickup-price-${index}`}
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <IntakeCombobox
          value={line.conditionGrade ?? null}
          onChange={(value) =>
            onPatch({ conditionGrade: value as NonNullable<InboundOrderLine['conditionGrade']> })
          }
          options={CONDITION_OPTIONS}
          placeholder="Condition grade"
          searchPlaceholder="Find condition"
          ariaLabel={`Condition grade for ${line.title || `product ${index + 1}`}`}
          testId={`kiosk-pickup-condition-${index}`}
        />
        <IntakeCombobox
          value={line.partsStatus ?? null}
          onChange={(value) =>
            onPatch({ partsStatus: value as NonNullable<InboundOrderLine['partsStatus']> })
          }
          options={PARTS_OPTIONS}
          placeholder="Parts status"
          searchPlaceholder="Find parts status"
          ariaLabel={`Parts status for ${line.title || `product ${index + 1}`}`}
          testId={`kiosk-pickup-parts-${index}`}
        />
      </div>
      {line.partsStatus === 'MISSING_PARTS' ? (
        <KioskEntryField
          name="What is missing?"
          idScope={line.lineKey}
          value={line.missingPartsNote ?? ''}
          onChange={(missingPartsNote) => onPatch({ missingPartsNote })}
        />
      ) : null}
      <KioskEntryField
        name="Condition note (optional)"
        idScope={line.lineKey}
        value={line.conditionNote ?? ''}
        onChange={(conditionNote) => onPatch({ conditionNote })}
        multiline
      />
    </section>
  );
}

export function KioskLocalPickupIntake({
  sidebarHeader,
  trailEnd,
  onClose,
}: {
  sidebarHeader: ReactNode;
  trailEnd: ReactNode;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('browse');
  const [selectedProduct, setSelectedProduct] = useState<ProductSelection | null>(null);
  const [products, setProducts] = useState<SelectedItem[]>([]);
  const [draft, setDraft] = useState<InboundOrderDraft>(() =>
    createKioskPickupDraft(localDateToDateKey(new Date()) ?? new Date().toISOString().slice(0, 10)),
  );
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [readingPaperwork, setReadingPaperwork] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [labelStepUpOpen, setLabelStepUpOpen] = useState(false);
  const [printingLabels, setPrintingLabels] = useState(false);
  const [landed, setLanded] = useState<IngestInboundOrderResult | null>(null);
  const [labelPrintSummary, setLabelPrintSummary] = useState<LabelPrintSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useRef(safeRandomUUID());
  const paperworkInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const abort = new AbortController();
    setVendorLoading(true);
    // Vendors are a small org-owned dictionary: load once and let the
    // combobox filter in memory, so typing never waits on a database round trip.
    kioskFetchHealed('/api/kiosk/local-pickup', { signal: abort.signal })
      .then((response) => response.json())
      .then((body: { vendors?: VendorOption[] }) => {
        if (!abort.signal.aborted) setVendors(Array.isArray(body.vendors) ? body.vendors : []);
      })
      .catch(() => {
        if (!abort.signal.aborted) setVendors([]);
      })
      .finally(() => {
        if (!abort.signal.aborted) setVendorLoading(false);
      });
    return () => {
      abort.abort();
    };
  }, []);

  const setPickedProducts = useCallback((next: SelectedItem[]) => {
    setProducts(next);
    setDraft((current) => syncKioskPickupProducts(current, next));
  }, []);

  const addManualProduct = useCallback((title: string) => {
    const item: SelectedItem = {
      id: `manual:${safeRandomUUID()}`,
      name: title,
      sku: '',
      price: null,
    };
    setProducts((current) => {
      const next = [...current, item];
      setDraft((draftNow) => syncKioskPickupProducts(draftNow, next));
      return next;
    });
  }, []);

  const readPaperwork = useCallback(
    async (files: readonly File[]) => {
      const images = files.filter((file) => file.type.startsWith('image/')).slice(0, 6);
      if (images.length === 0 || readingPaperwork) return;
      setReadingPaperwork(true);
      setError(null);
      try {
        const imageDataUrls = await Promise.all(images.map(readFileAsDataUrl));
        const response = await kioskFetchHealed('/api/kiosk/local-pickup/extract', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ imageDataUrls }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          draft?: InboundOrderDraft;
          error?: string;
        };
        if (!response.ok || !body.draft) {
          throw new Error(body.error || 'Could not read the paperwork');
        }

        const normalizedLines = body.draft.lines.map((line, index) => ({
          ...line,
          lineKey: line.lineKey.trim() || `ocr:${index + 1}:${safeRandomUUID()}`,
        }));
        const extracted = { ...body.draft, lines: normalizedLines };
        setDraft(extracted);
        setProducts(
          normalizedLines.map((line) => ({
            id: line.lineKey,
            name: line.title || line.sku || 'Unidentified product',
            sku: line.sku,
            price: line.unitCostCents == null ? null : line.unitCostCents / 100,
          })),
        );
        setPhase('details');
      } catch (paperworkError) {
        setError(
          paperworkError instanceof Error
            ? paperworkError.message
            : 'Could not read the paperwork',
        );
      } finally {
        setReadingPaperwork(false);
      }
    },
    [readingPaperwork],
  );

  const unitCount = draft.lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0);
  const totalCents = draft.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const vendorSelected = vendors.some((vendor) => vendor.name === draft.vendor);
  const detailsReady = Boolean(vendorSelected && draft.orderNumber.trim() && draft.orderDate);
  const itemsReady = draft.lines.length > 0 && draft.lines.every(
    (line) =>
      Boolean((line.title.trim() || line.sku.trim()) && line.quantity && line.conditionGrade) &&
      line.unitCostCents != null &&
      (line.partsStatus !== 'MISSING_PARTS' || Boolean(line.missingPartsNote?.trim())),
  );
  const canSubmit = detailsReady && itemsReady && kioskPickupReady(draft);

  const submit = useCallback(async (creds: KioskPaymentStepUpResult) => {
    if (!canSubmit || submitting) {
      return { ok: false as const, error: 'Finish the required pickup fields first.' };
    }
    setSubmitting(true);
    setError(null);
    try {
      const response = await kioskFetchHealed('/api/kiosk/local-pickup', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': idempotencyKey.current,
        },
        body: JSON.stringify({ draft, staffId: creds.staffId, pin: creds.pin }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        result?: IngestInboundOrderResult;
        error?: string;
      };
      if (!response.ok || !body.result) {
        throw new Error(body.error || 'Could not add the local pickup');
      }
      setLanded(body.result);
      setStepUpOpen(false);
      setPhase('done');
      return { ok: true as const };
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : 'Could not add the local pickup';
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, draft, submitting]);

  const printLandedLabels = useCallback(async (creds: KioskPaymentStepUpResult) => {
    if (!landed?.localPickupOrderId || printingLabels) {
      return { ok: false as const, error: 'The pickup record is not ready for labels.' };
    }
    setPrintingLabels(true);
    setError(null);
    try {
      const response = await kioskFetchHealed('/api/kiosk/local-pickup/labels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          localPickupOrderId: landed.localPickupOrderId,
          lineIds: landed.lines.map((line) => line.receivingLineId),
          issuanceVersion: safeRandomUUID().replaceAll('-', '_'),
          staffId: creds.staffId,
          pin: creds.pin,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        labels?: KioskIssuedLabel[];
        failedLines?: number;
        error?: string;
      };
      const labels = Array.isArray(body.labels) ? body.labels : [];
      if (!response.ok || !body.success || labels.length === 0) {
        throw new Error(body.error || 'No product labels are ready to print');
      }
      labels.forEach((label, index) => {
        window.setTimeout(() => {
          printProductLabel({
            sku: label.sku,
            title: label.title,
            serialNumber: label.serialNumber ?? undefined,
            qrPayload: label.qrPayload,
            condition: label.condition,
          });
        }, index * 200);
      });
      setLabelPrintSummary({ printed: labels.length, failedLines: body.failedLines ?? 0 });
      setLabelStepUpOpen(false);
      return { ok: true as const };
    } catch (printError) {
      const message = printError instanceof Error ? printError.message : 'Could not print product labels';
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      setPrintingLabels(false);
    }
  }, [landed, printingLabels]);

  if (phase === 'browse') {
    const paperworkPicker = (
      <>
        <input
          ref={paperworkInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            void readPaperwork(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<Camera className="h-4 w-4" />}
          loading={readingPaperwork}
          onClick={() => paperworkInput.current?.click()}
          data-testid="kiosk-pickup-paperwork"
        >
          Read paperwork
        </Button>
        {trailEnd}
      </>
    );
    return (
      <>
        <ProductSelector
          apiBasePath="/api/kiosk/repair"
          catalogSearchMode="server"
          appearance="flush"
          layout="kiosk-split"
          hideCartTray
          flowInPage
          sidebarHeader={sidebarHeader}
          trailEnd={paperworkPicker}
          catalogPhase="browse"
          onContinue={() => setPhase('details')}
          continueLabel={`Review pickup · ${products.length} product${products.length === 1 ? '' : 's'}`}
          continueVisible={products.length > 0}
          selectedProduct={selectedProduct}
          onSelect={setSelectedProduct}
          selectedItems={products}
          onSelectedItemsChange={setPickedProducts}
          onManualItemAdd={addManualProduct}
        />
        {error ? (
          <p className="absolute bottom-20 left-1/2 z-20 -translate-x-1/2 bg-surface-danger px-4 py-2 text-sm font-semibold text-text-danger">
            {error}
          </p>
        ) : null}
      </>
    );
  }

  if (phase === 'done') {
    const pickupHref = landed?.localPickupOrderId
      ? `/pickup?lcpu=${landed.localPickupOrderId}`
      : undefined;
    return (
      <>
        <KioskPaneForm
          testId="kiosk-local-pickup-done"
          hero={
            <>
            <span className="flex size-14 items-center justify-center rounded-mode-pill bg-surface-success text-text-success">
              <Check className="size-7" />
            </span>
            <div>
              <h2 className="text-role-display font-bold text-text-default">Local pickup imported</h2>
              <p className="mt-2 text-text-soft">
                {draft.orderNumber} is now available in Receiving and the Sales receipt history.
              </p>
            </div>
            <div className="grid w-full max-w-md grid-cols-2 gap-px overflow-hidden rounded-mode border border-border-hairline bg-border-hairline text-left">
              <div className="bg-surface-card px-4 py-3">
                <p className={KIOSK_META}>Receiving lines</p>
                <p className="mt-1 text-role-title font-bold text-text-default">{landed?.lines.length ?? 0}</p>
              </div>
              <div className="bg-surface-card px-4 py-3">
                <p className={KIOSK_META}>Physical items</p>
                <p className="mt-1 text-role-title font-bold text-text-default">{unitCount}</p>
              </div>
            </div>
            <p className="max-w-md text-role-caption text-text-muted">
              Next: print one 2×1 identity label per item, then scan each item through Receiving quality control.
            </p>
            {labelPrintSummary ? (
              <p className="text-sm font-semibold text-text-success" data-testid="kiosk-pickup-label-result">
                {labelPrintSummary.printed} label{labelPrintSummary.printed === 1 ? '' : 's'} dispatched
                {labelPrintSummary.failedLines > 0
                  ? ` · ${labelPrintSummary.failedLines} line${labelPrintSummary.failedLines === 1 ? '' : 's'} need SKU pairing`
                  : ''}
              </p>
            ) : null}
            {error ? <p className="text-sm font-semibold text-text-danger">{error}</p> : null}
            </>
          }
          footer={
            <>
              {pickupHref ? (
                <Button
                  variant="secondary"
                  size="lg"
                  href={pickupHref}
                  icon={<ExternalLink className="h-4 w-4" />}
                  data-testid="kiosk-pickup-open-record"
                >
                  Open Receiving record
                </Button>
              ) : null}
              <Button
                variant="secondary"
                size="lg"
                icon={<Printer className="h-4 w-4" />}
                loading={printingLabels}
                disabled={!landed?.localPickupOrderId}
                onClick={() => setLabelStepUpOpen(true)}
                data-testid="kiosk-pickup-print-labels"
              >
                Print {unitCount} product label{unitCount === 1 ? '' : 's'}
              </Button>
              <Button size="lg" className={KIOSK_POS_CTA} onClick={onClose}>
                Done
              </Button>
            </>
          }
        />
        <KioskPaymentStepUpSheet
          open={labelStepUpOpen}
          onClose={() => setLabelStepUpOpen(false)}
          onAuthorized={printLandedLabels}
          scope="printing"
          title="Authorize product-label printing"
          blurb="A staff PIN with label access records who issued these item identities."
        />
      </>
    );
  }

  const step = phase === 'details' ? 0 : phase === 'items' ? 1 : 2;
  const nextEnabled = step === 0 ? detailsReady : step === 1 ? itemsReady : canSubmit;

  return (
    <KioskPaneForm
      testId="kiosk-local-pickup-form"
      progress={{
        current: step,
        total: 3,
        onClose: phase === 'details' ? () => setPhase('browse') : onClose,
        closeLabel: phase === 'details' ? 'Back to products' : 'Close local pickup intake',
        label: 'Local pickup intake progress',
      }}
      footer={
        <>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => setPhase(step === 0 ? 'browse' : step === 1 ? 'details' : 'items')}
          >
            ‹ Back
          </Button>
          {phase !== 'review' ? (
            <Button
              size="lg"
              className={KIOSK_POS_CTA}
              disabled={!nextEnabled}
              onClick={() => setPhase(phase === 'details' ? 'items' : 'review')}
              data-testid="kiosk-pickup-continue"
            >
              Continue
            </Button>
          ) : (
            <Button
              size="lg"
              variant="warning"
              className={KIOSK_POS_CTA}
              disabled={!canSubmit || submitting}
              onClick={() => setStepUpOpen(true)}
              data-testid="kiosk-pickup-submit"
            >
              {submitting ? 'Importing…' : 'Import local pickup'}
            </Button>
          )}
        </>
      }
    >
      <KioskStepTitleRow
        title={phase === 'details' ? 'Pickup details' : phase === 'items' ? 'Product triage' : 'Review pickup'}
        count={unitCount}
        totalCents={totalCents}
        meta={draft.orderNumber || null}
        testId="kiosk-pickup-summary"
      />

      {phase === 'details' ? (
        <div className="flex flex-col gap-3 px-4 pb-6">
          <label className="flex flex-col gap-1 text-role-caption font-semibold text-text-muted">
            Vendor / seller
            <IntakeCombobox
              value={draft.vendor || null}
              onChange={(vendor) => setDraft((current) => ({ ...current, vendor }))}
              options={vendors.map((vendor) => ({ value: vendor.name, label: vendor.name }))}
              disabled={vendorLoading}
              placeholder="Select an imported vendor"
              searchPlaceholder="Search vendors"
              emptyMessage="No vendor matches"
              ariaLabel="Local pickup vendor"
              testId="kiosk-pickup-vendor"
            />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <KioskEntryField
              name="Order / pickup number"
              value={draft.orderNumber}
              onChange={(orderNumber) => setDraft((current) => ({ ...current, orderNumber }))}
              testId="kiosk-pickup-order-number"
            />
            <KioskEntryField
              name="Pickup date"
              type="date"
              value={draft.orderDate ?? ''}
              onChange={(orderDate) => setDraft((current) => ({ ...current, orderDate: orderDate || null }))}
              testId="kiosk-pickup-date"
            />
            <KioskEntryField
              name="Payment method (Cash, Zelle, Venmo…)"
              value={draft.pickup?.paymentMethod ?? ''}
              onChange={(paymentMethod) =>
                setDraft((current) => ({
                  ...current,
                  pickup: { paymentMethod, paidCents: current.pickup?.paidCents ?? null },
                }))
              }
              testId="kiosk-pickup-payment-method"
            />
            <KioskEntryField
              name="Amount paid"
              value={centsText(draft.pickup?.paidCents)}
              inputMode="decimal"
              onChange={(raw) =>
                setDraft((current) => ({
                  ...current,
                  pickup: {
                    paymentMethod: current.pickup?.paymentMethod ?? '',
                    paidCents: inputCents(raw),
                  },
                }))
              }
              testId="kiosk-pickup-paid"
            />
          </div>
        </div>
      ) : null}

      {phase === 'items' ? (
        <div className="flex flex-col gap-3 px-4 pb-6">
          {draft.lines.map((line, index) => (
            <KioskPickupLineCard
              key={line.lineKey}
              line={line}
              index={index}
              canRemove={draft.lines.length > 1}
              onPatch={(patch) => setDraft((current) => patchLine(current, index, patch))}
              onRemove={() => {
                setDraft((current) => ({
                  ...current,
                  lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
                }));
                setProducts((current) => current.filter((item) => item.id !== line.lineKey));
              }}
            />
          ))}
          <Button
            variant="ghost"
            size="lg"
            className="w-full"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => setPhase('browse')}
          >
            Add another product
          </Button>
        </div>
      ) : null}

      {phase === 'review' ? (
        <div className="flex flex-col gap-4 px-4 pb-6">
          <section>
            <h3 className={KIOSK_SECTION_LABEL_ROW}>Receiving record</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 py-3 text-role-caption">
              <dt className="text-text-muted">Vendor</dt><dd className="text-right font-semibold">{draft.vendor}</dd>
              <dt className="text-text-muted">Pickup date</dt><dd className="text-right font-semibold">{draft.orderDate}</dd>
              <dt className="text-text-muted">Order</dt><dd className="text-right font-semibold">{draft.orderNumber}</dd>
              <dt className="text-text-muted">Payment</dt><dd className="text-right font-semibold">{draft.pickup?.paymentMethod || 'Not recorded'}</dd>
            </dl>
          </section>
          <section className="divide-y divide-border-hairline border-y border-border-hairline">
            {draft.lines.map((line) => (
              <div key={line.lineKey} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className={KIOSK_TILE_TITLE}>{line.title || line.sku}</p>
                  <p className={cn('mt-1', KIOSK_META)}>
                    {line.quantity} × {centsText(line.unitCostCents)} · {line.conditionGrade?.replaceAll('_', ' ')}
                  </p>
                </div>
                <p className="shrink-0 font-semibold tabular-nums text-text-success">
                  ${(lineTotal(line) / 100).toFixed(2)}
                </p>
              </div>
            ))}
          </section>
          <KioskEntryField
            name="Notes for receiving (optional)"
            value={draft.notes}
            onChange={(notes) => setDraft((current) => ({ ...current, notes }))}
            multiline
          />
          {error ? <p className="text-center text-sm font-semibold text-text-danger">{error}</p> : null}
          <p className="text-center text-role-caption text-text-muted">
            Importing creates one inbound pickup and projects it to both Receiving and Sales.
          </p>
        </div>
      ) : null}
      <KioskPaymentStepUpSheet
        open={stepUpOpen}
        onClose={() => setStepUpOpen(false)}
        onAuthorized={submit}
        scope="receiving"
        title="Authorize local pickup import"
        blurb="A staff PIN with receiving intake access records who imported this pickup."
      />
    </KioskPaneForm>
  );
}
