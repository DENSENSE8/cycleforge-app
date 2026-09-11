'use client';

/**
 * Landscape repair details — edits a REPAIR line on the session cart.
 * Does not post to the API; Pay / Save on {@link KioskCartLedger} submits the
 * whole polymorphic cart via `/api/kiosk/intake`.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import { ChevronLeft } from '@/components/Icons';
import { ReasonSelector } from '@/components/repair/ReasonSelector';
import { KioskCustomerIntake } from '@/components/kiosk/KioskCustomerIntake';
import { SignaturePad, type SignatureData } from '@/components/repair/SignaturePad';
import { RepairPaperworkSheet } from '@/components/repair/RepairPaperworkSheet';
import type { ProductSelection } from '@/components/repair/ProductSelector';
import type { RepairFormData } from '@/components/repair/RepairIntakeForm';
import {
  buildInitialFormData,
  canSubmitRepairIntake,
  getRepairSubmitBlockReason,
} from '@/components/repair/repair-intake-logic';
import { useRepairIntakeData } from '@/components/repair/useRepairIntakeData';
import {
  useKioskSession,
  useKioskSessionActions,
} from '@/lib/kiosk/kiosk-session-store';
import { isRepairPayload } from '@/lib/kiosk/cart-line';
import {
  KIOSK_PANE_FOOTER_BAND,
  KIOSK_PANE_HEADER_BAND,
  KIOSK_PANE_HEADER_TITLE,
  KIOSK_SECTION_LABEL_ROW,
} from '@/app/kiosk/kiosk-chrome';
import { cornerClass } from '@/design-system/tokens/radius';
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

const SECTION_LABEL = KIOSK_SECTION_LABEL_ROW;

export function KioskRepairPane({ selectedProduct, price, onBack }: KioskRepairPaneProps) {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  const [formData, setFormData] = useState<RepairFormData>(() => buildInitialFormData());
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null);
  const [showPaperwork, setShowPaperwork] = useState(false);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  const { skuIssues } = useRepairIntakeData(null, true);
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
      setShowPaperwork(false);
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

  const blockReason = getRepairSubmitBlockReason(formData, !!signatureData);
  const canSave = canSubmitRepairIntake(formData, !!signatureData);

  return (
    <div className="flex h-full flex-col" data-testid="kiosk-repair-pane">
      <div className={KIOSK_PANE_HEADER_BAND}>
        {onBack ? (
          <IconButton
            icon={<ChevronLeft className="h-5 w-5" />}
            ariaLabel="Back to catalog"
            size="touch"
            onClick={onBack}
            className="shrink-0 hover:bg-surface-hover"
            data-testid="kiosk-repair-back"
          />
        ) : null}
        <h2 className={KIOSK_PANE_HEADER_TITLE}>Repair details</h2>
        <RepairPaperworkSheet
          active={showPaperwork}
          onToggle={() => setShowPaperwork((v) => !v)}
          disabled={!hasProduct}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-0">
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
          <div className="flex w-full flex-col divide-y divide-border-hairline">
            <section>
              <h3 className={SECTION_LABEL}>1. Issue details</h3>
              <div className="bg-surface-card">
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
            </section>

            <section>
              <h3 className={SECTION_LABEL}>2. Customer information</h3>
              <KioskCustomerIntake
                heading={null}
                className="bg-surface-card"
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
                    <TextField
                      label="Serial number"
                      value={formData.serialNumber}
                      mono
                      inputClassName="rounded-none"
                      onChange={(value) =>
                        setFormData((prev) => ({ ...prev, serialNumber: value }))
                      }
                    />
                    <TextField
                      label="Price ($)"
                      value={formData.price}
                      inputMode="decimal"
                      inputClassName="rounded-none font-semibold text-text-success"
                      onChange={(value) =>
                        setFormData((prev) => ({ ...prev, price: value }))
                      }
                    />
                    <TextField
                      label="Notes (optional)"
                      value={formData.notes}
                      multiline
                      rows={3}
                      inputClassName="rounded-none"
                      onChange={(value) =>
                        setFormData((prev) => ({ ...prev, notes: value }))
                      }
                    />
                  </>
                }
              />
            </section>

            <section>
              <h3 className={SECTION_LABEL}>3. Authorization</h3>
              <div className="bg-surface-card px-4 py-4">
                <SignaturePad
                  variant="dropoff"
                  label="Sign to authorize the service"
                  allowFullscreen
                  onSignatureChange={setSignatureData}
                />
              </div>
            </section>

            {blockReason && !canSave && (
              <section className="px-4 py-3">
                <p className="text-center text-sm font-semibold text-text-soft">{blockReason}</p>
              </section>
            )}
          </div>
        )}
      </div>

      {hasProduct && (
        <div className={KIOSK_PANE_FOOTER_BAND} data-kiosk-footer-band>
          {onBack ? (
            <Button
              variant="secondary"
              size="lg"
              className={cn('h-full min-h-0 flex-1 rounded-none', cornerClass('flush'))}
              onClick={onBack}
              data-testid="kiosk-repair-add-another"
            >
              Add another service
            </Button>
          ) : null}
          <Button
            size="lg"
            className={cn('h-full min-h-0 w-full flex-1 rounded-none', cornerClass('flush'))}
            disabled={!canSave}
            onClick={saveToCart}
            title={blockReason ?? undefined}
          >
            {savedFlash ? 'Saved to cart' : 'Save to cart'}
          </Button>
        </div>
      )}
    </div>
  );
}
