'use client';

/**
 * Landscape repair details — edits a REPAIR line on the session cart.
 * Does not post to the API; Pay / Save on {@link KioskCartLedger} submits the
 * whole polymorphic cart via `/api/kiosk/intake`.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Button } from '@/design-system/primitives';
import { Plus } from '@/components/Icons';
import { StepProgressHeader } from '@/design-system/primitives/StepProgressHeader';
import { ReasonSelector } from '@/components/repair/ReasonSelector';
import { KioskCustomerIntake, KioskEntryField } from '@/components/kiosk/KioskCustomerIntake';
import { SignaturePad, type SignatureData } from '@/components/repair/SignaturePad';
import type { ProductSelection } from '@/components/repair/ProductSelector';
import type { RepairFormData } from '@/components/repair/RepairIntakeForm';
import {
  buildInitialFormData,
  canSubmitRepairIntake,
  getRepairSubmitBlockReason,
  repairStepGates,
} from '@/components/repair/repair-intake-logic';
import { useKioskSkuReasons } from '@/components/repair/useKioskSkuReasons';
import { mergeReasonLabel, SKU_REASON_LABEL_MAX } from '@/lib/repair/sku-reasons';
import {
  useKioskSession,
  useKioskSessionActions,
} from '@/lib/kiosk/kiosk-session-store';
import { isRepairPayload } from '@/lib/kiosk/cart-line';
import {
  KIOSK_PANE_HEADER_BAND,
  KIOSK_PANE_HEADER_TITLE,
} from '@/app/kiosk/kiosk-chrome';
import { KIOSK_POS_CTA, KIOSK_POS_CTA_SECONDARY, KIOSK_POS_FORM_MEASURE } from '@/app/kiosk/kiosk-pos-surface';
import { cn } from '@/utils/_cn';

interface KioskRepairPaneProps {
  selectedProduct: ProductSelection | null;
  /** Catalog price from the selection — empty until a priced SKU is picked. */
  price: string;
  /** Return to the repair catalog without clearing selected services. */
  onBack?: () => void;
}

function priceToCents(price: string): number {
  const cleaned = price.replace(/[^0-9.]/g, '');
  if (!cleaned) return 0;
  const dollars = Number.parseFloat(cleaned);
  if (!Number.isFinite(dollars) || dollars < 0) return 0;
  return Math.round(dollars * 100);
}

/**
 * The three step headers, in order — each the step's own question in plain
 * words. Operator 2026-09-14: no "Issue" eyebrow, no duplicate label inside
 * the step body; ONE bold display header, top-left.
 */
const STEP_HEADERS = ['Reason for repair', 'Contact information', 'Review & sign'] as const;

export function KioskRepairPane({ selectedProduct, price, onBack }: KioskRepairPaneProps) {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  const [formData, setFormData] = useState<RepairFormData>(() => buildInitialFormData());
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  /** Add-reason entry: closed until the operator taps the step's Add CTA. */
  const [reasonEntryOpen, setReasonEntryOpen] = useState(false);
  const [reasonDraft, setReasonDraft] = useState('');

  // Per-SKU reason vocabulary, device-authed (see useKioskSkuReasons). The
  // staff `useRepairIntakeData(null, true)` used to sit here and return an
  // empty list by design, so the pills only ever showed the built-in registry.
  const sourceSku = selectedProduct?.sourceSku?.trim() || null;
  const { labels: skuIssues, adding: addingReason, addReason } = useKioskSkuReasons(sourceSku);
  const hasProduct = Boolean(selectedProduct?.model?.trim());

  /**
   * The repair line this pane is editing, or null to start a new one.
   *
   * **A DIFFERENT device is a NEW line (changed 2026-08-21, SQ6).** This used
   * to fall back to `repairs[0]`, so selecting a second product overwrote the
   * first device's payload — serial, issues, signature and all — before submit
   * ever ran. That was a worse silent loss than the mapper's, because it
   * destroyed data the customer had already given.
   *
   * Now: an explicitly opened line wins; otherwise a MODEL MATCH re-opens that
   * device (choosing the same SKU twice is still one device, which is the
   * behaviour the old comment was reaching for); anything else starts fresh.
   */
  const existingRepair = useMemo(() => {
    const repairs = session.lines.filter(
      (l) => l.type === 'REPAIR' && isRepairPayload(l.payload),
    );
    if (activeLineId) return repairs.find((l) => l.id === activeLineId) ?? null;
    if (!selectedProduct?.model) return null;
    return (
      repairs.find(
        (l) => isRepairPayload(l.payload) && l.payload.productModel === selectedProduct.model,
      ) ?? null
    );
  }, [session.lines, selectedProduct?.model, activeLineId]);

  useEffect(() => {
    if (selectedProduct) {
      setFormData((prev) => ({
        ...prev,
        product: selectedProduct,
        price: price.trim() || (prev.price.trim() ? prev.price : ''),
        customer: {
          name: session.customerName || prev.customer.name,
          phone: session.customerPhone || prev.customer.phone,
          email: session.customerEmail || prev.customer.email,
        },
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        product: { type: '', model: '', sourceSku: null },
        price: '',
      }));
    }
  }, [selectedProduct, price, session.customerName, session.customerPhone, session.customerEmail]);

  // Hydrate from an existing cart line when present.
  useEffect(() => {
    if (!existingRepair || !isRepairPayload(existingRepair.payload)) return;
    const p = existingRepair.payload;
    setActiveLineId(existingRepair.id);
    setFormData((prev) => ({
      ...prev,
      product: {
        type: p.productType ?? '',
        model: p.productModel,
        sourceSku: p.sourceSku ?? null,
      },
      repairReasons: p.repairReasons ?? [],
      repairNotes: p.repairNotes ?? '',
      serialNumber: p.serialNumber,
      price: p.price,
      notes: p.notes ?? '',
    }));
    if (p.signatureDataUrl) {
      setSignatureData({
        dataUrl: p.signatureDataUrl,
        strokes: p.signatureStrokes,
      } as SignatureData);
    }
  }, [existingRepair?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- hydrate once per line id

  const updateCustomer = useCallback(
    (field: string, value: string) => {
      setFormData((prev) => ({ ...prev, customer: { ...prev.customer, [field]: value } }));
      if (field === 'phone') actions.setCustomer({ phone: value });
      if (field === 'name') actions.setCustomer({ name: value });
      if (field === 'email') actions.setCustomer({ email: value });
    },
    [actions],
  );

  /**
   * Add a reason for THIS SKU and pick it.
   *
   * Selecting it is the point: the operator typed it while answering "Reason
   * for repair" for the device on the counter, so it is both a new vocabulary
   * row for the SKU and this repair's answer. One tap on the pill undoes the
   * selection; the row stays.
   *
   * Pill, selection and closing the entry all happen in ONE frame, before the
   * POST — the paint is the feedback. Waiting for the server first left the
   * pill on screen but unselected for the round trip, which reads as the tap
   * having missed. A failure takes the selection back with it (the hook
   * rolls back the pill itself and toasts).
   */
  const submitReason = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const label = reasonDraft.trim();
      if (!label) return;
      setFormData((prev) => ({
        ...prev,
        repairReasons: mergeReasonLabel(prev.repairReasons, label),
      }));
      setReasonDraft('');
      setReasonEntryOpen(false);
      const saved = await addReason(label);
      if (!saved) {
        setFormData((prev) => ({
          ...prev,
          repairReasons: prev.repairReasons.filter((r) => r !== label),
        }));
      }
    },
    [addReason, reasonDraft],
  );

  const blockReason = getRepairSubmitBlockReason(formData, !!signatureData);
  const canSave = canSubmitRepairIntake(formData, !!signatureData);

  // to a step-by-step mobile path native — continue after the issue, continue
  // after the information, continue after the authorization signature." Each
  // step ends in the same floating-free key the catalog uses; nothing scrolls
  // except the step's own content. STEP_HEADERS is the operator-facing copy
  // (module scope, below) — "Issue" never appears on screen; the step asks
  // its question in plain words instead.
  const steps = STEP_HEADERS;
  const [step, setStep] = useState(0);
  const lastStep = steps.length - 1;

  // ONE gate table for both consumers: the per-step Continue key and the
  // header's completed count (PG6 — a count of satisfied units, never the
  // index in view). Back-editing an earlier step un-fills its segment.
  const stepGates = repairStepGates(formData, !!signatureData);
  const stepCanContinue = stepGates[step] ?? canSave;
  const completedSteps = stepGates.filter(Boolean).length;

  const saveToCart = () => {
    if (!hasProduct || !selectedProduct) return;
    const payload = {
      productType: selectedProduct.type || null,
      productModel: selectedProduct.model,
      sourceSku: selectedProduct.sourceSku ?? null,
      repairReasons: formData.repairReasons,
      repairNotes: formData.repairNotes || null,
      serialNumber: formData.serialNumber,
      passcode: null,
      imei: null,
      notes: formData.notes || null,
      price: formData.price.trim() || price.trim(),
      signatureDataUrl: signatureData?.dataUrl ?? null,
      signatureStrokes: signatureData?.strokes ?? null,
    };
    const unitAmountCents = priceToCents(payload.price);
    const title = selectedProduct.model;

    if (activeLineId || existingRepair) {
      const id = activeLineId ?? existingRepair!.id;
      actions.updateRepairLine(id, { title, unitAmountCents, payload });
      setActiveLineId(id);
    } else {
      const line = actions.addRepair({ title, unitAmountCents, payload });
      setActiveLineId(line.id);
    }
    actions.setCustomer({
      phone: formData.customer.phone,
      name: formData.customer.name,
      email: formData.customer.email,
    });
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  };

  return (
    <div className="flex h-full flex-col" data-testid="kiosk-repair-pane">
      {onBack ? (
        <StepProgressHeader
          current={completedSteps}
          total={steps.length}
          onClose={onBack}
          closeLabel="Back to catalog"
          label="Repair intake progress"
        />
      ) : (
        <div className={KIOSK_PANE_HEADER_BAND}>
          <h2 className={KIOSK_PANE_HEADER_TITLE}>Repair details</h2>
        </div>
      )}


      <div className="min-h-0 flex-1 overflow-y-auto p-0" data-kiosk-repair-step={step}>
        {!hasProduct ? (
          <div className="flex h-full items-center justify-center px-4">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-text-default">No product selected</h3>
              <p className="mt-2 text-text-soft">
                Select a repair service from the catalog to begin intake.
              </p>
            </div>
          </div>
        ) : (
          <div className={cn('w-full', KIOSK_POS_FORM_MEASURE)}>
            {/* ONE main header per step, top-left, in the display role at bold
                weight — the step's whole identity (operator 2026-09-14:
                "main header as a black font and text… like 'reason for
                repair', top left"). The paperwork sheet is NOT here: the
                header cluster's paperwork glyph is the one way to it, and a
                second entry point inside the form read as step chrome.

                Step 0 puts the Add CTA opposite the header, inside the same
                measure (operator 2026-09-14: "there should be an add button
                top right as a CTA button so you would be able to add a reason
                for repair for that SKU specifically"). `secondary`, not a
                second primary: the step's primary key is Continue, on the
                footer. */}
            <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-5">
              <h2 className="min-w-0 text-left text-role-display font-bold text-text-default">
                {STEP_HEADERS[step]}
              </h2>
              {step === 0 ? (
                <Button
                  variant="secondary"
                  size="md"
                  icon={<Plus />}
                  disabled={!sourceSku}
                  title={sourceSku ? undefined : 'Pick a catalog service to add a reason to it'}
                  onClick={() => setReasonEntryOpen((open) => !open)}
                  aria-expanded={reasonEntryOpen}
                  data-testid="kiosk-repair-add-reason"
                >
                  Add
                </Button>
              ) : null}
            </div>

            {step === 0 && (
              <div className="bg-surface-card pb-4">
                {reasonEntryOpen ? (
                  // A form, so the tablet keyboard's Go key commits — there is
                  // no hardware Enter at the counter.
                  <form onSubmit={submitReason} className="flex items-center gap-2 px-3 pb-3">
                    <div className="min-w-0 flex-1">
                      <KioskEntryField
                        name="New reason for this device"
                        value={reasonDraft}
                        maxLength={SKU_REASON_LABEL_MAX}
                        testId="kiosk-repair-reason-draft"
                        onChange={setReasonDraft}
                      />
                    </div>
                    <Button
                      type="submit"
                      size="lg"
                      loading={addingReason}
                      disabled={!reasonDraft.trim()}
                      data-testid="kiosk-repair-reason-save"
                    >
                      Save
                    </Button>
                  </form>
                ) : null}
                <ReasonSelector
                  appearance="pills"
                  selectedReasons={formData.repairReasons}
                  notes={formData.repairNotes}
                  onReasonsChange={(reasons) =>
                    setFormData((prev) => ({ ...prev, repairReasons: reasons }))
                  }
                  onNotesChange={(notes) =>
                    setFormData((prev) => ({ ...prev, repairNotes: notes }))
                  }
                  skuIssues={skuIssues}
                />
              </div>
            )}

            {step === 1 && (
              <KioskCustomerIntake
                entry
                heading={null}
                className="bg-surface-card pb-4"
                value={{
                  phone: formData.customer.phone,
                  name: formData.customer.name,
                  email: formData.customer.email,
                  address: '',
                }}
                onChange={(next) => {
                  updateCustomer('phone', next.phone);
                  updateCustomer('name', next.name);
                  updateCustomer('email', next.email);
                }}
                extras={
                  <>
                    <KioskEntryField
                      name="Serial number"
                      value={formData.serialNumber}
                      testId="kiosk-repair-serial"
                      onChange={(value) =>
                        setFormData((prev) => ({ ...prev, serialNumber: value }))
                      }
                    />
                    <KioskEntryField
                      name="Price ($)"
                      value={formData.price}
                      inputMode="decimal"
                      testId="kiosk-repair-price"
                      onChange={(value) =>
                        setFormData((prev) => ({ ...prev, price: value }))
                      }
                    />
                    <KioskEntryField
                      name="Notes (optional)"
                      value={formData.notes}
                      multiline
                      testId="kiosk-repair-notes"
                      onChange={(value) =>
                        setFormData((prev) => ({ ...prev, notes: value }))
                      }
                    />
                  </>
                }
              />
            )}

            {step === lastStep && (
              <div className="bg-surface-card px-4 pb-6 pt-2">
                <SignaturePad
                  variant="dropoff"
                  label="Sign to authorize the service"
                  allowFullscreen
                  onSignatureChange={setSignatureData}
                />
                {blockReason && !canSave && (
                  <p className="pt-3 text-center text-sm font-semibold text-text-soft">
                    {blockReason}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {hasProduct && (
        <div
          className="flex flex-wrap items-center justify-center gap-2 px-4 py-4"
          data-kiosk-footer-band
        >
          {step > 0 ? (
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              data-testid="kiosk-repair-step-back"
            >
              ‹ Back
            </Button>
          ) : null}

          {step < lastStep ? (
            <Button
              size="lg"
              className={KIOSK_POS_CTA}
              disabled={!stepCanContinue}
              onClick={() => setStep((s) => Math.min(lastStep, s + 1))}
              data-testid="kiosk-repair-continue"
            >
              Continue
            </Button>
          ) : (
            <>
              <Button
                size="lg"
                className={KIOSK_POS_CTA}
                disabled={!canSave}
                onClick={saveToCart}
                title={blockReason ?? undefined}
              >
                {savedFlash ? 'Saved to cart' : 'Save to cart'}
              </Button>
              {onBack ? (
                <Button
                  variant="secondary"
                  size="lg"
                  className={KIOSK_POS_CTA_SECONDARY}
                  onClick={onBack}
                  data-testid="kiosk-repair-add-another"
                >
                  {/* Operator ruling: "add or edit text with a pencil icon,
                      not too many words" — this was "Add another service". */}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden
                  >
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                    <path d="m15 5 4 4" />
                  </svg>
                  Add
                </Button>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
