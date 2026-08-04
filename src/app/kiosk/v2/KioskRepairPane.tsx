'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Button } from '@/design-system/primitives';
import { Loader2, Check } from '@/components/Icons';
import { ReasonSelector } from '@/components/repair/ReasonSelector';
import { CustomerInfoForm, CONTACT_FIELDS } from '@/components/repair/CustomerInfoForm';
import { SignaturePad, type SignatureData } from '@/components/repair/SignaturePad';
import RepairServiceForm from '@/components/repair/RepairServiceForm';
import { RepairPaperworkCanvas } from '@/components/repair/RepairPaperworkCanvas';
import { RepairPaperworkSheet } from '@/components/repair/RepairPaperworkSheet';
import type { ProductSelection } from '@/components/repair/ProductSelector';
import type { RepairFormData, RepairSubmitResult } from '@/components/repair/RepairIntakeForm';
import {
  buildInitialFormData,
  canSubmitRepairIntake,
  getRepairSubmitBlockReason,
} from '@/components/repair/repair-intake-logic';
import { useRepairIntakeData } from '@/components/repair/useRepairIntakeData';
import { buildRepairIntakeReceiptProps } from '@/lib/repair/repair-intake-receipt';
import { safeRandomUUID } from '@/lib/safe-uuid';

interface KioskRepairPaneProps {
  selectedProduct: ProductSelection | null;
  /** Catalog price from the left-rail selection — empty until a priced SKU is picked. */
  price: string;
  onReset: () => void;
}

function formatReceiptToday(): string {
  return new Date().toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

/**
 * Landscape right-pane repair intake. Composes the same validation + receipt
 * helpers as `RepairIntakeForm` (kioskMode); submit goes through the device-authed
 * route with an idempotency key, matching the proven `/kiosk` host wiring.
 */
export function KioskRepairPane({ selectedProduct, price, onReset }: KioskRepairPaneProps) {
  const [formData, setFormData] = useState<RepairFormData>(() => buildInitialFormData());
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<RepairSubmitResult | null>(null);
  const [showPaperwork, setShowPaperwork] = useState(false);
  const repairIdemKey = useRef<string | null>(null);

  const { skuIssues } = useRepairIntakeData(null, true);
  const hasProduct = Boolean(selectedProduct?.model?.trim());

  useEffect(() => {
    if (selectedProduct) {
      setFormData((prev) => ({
        ...prev,
        product: selectedProduct,
        // Prefer catalog price; keep a staff override only when the catalog has none.
        price: price.trim() || (prev.price.trim() ? prev.price : ''),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        product: { type: '', model: '', sourceSku: null },
        price: '',
      }));
      setShowPaperwork(false);
    }
  }, [selectedProduct, price]);

  const updateCustomer = useCallback((field: string, value: string) => {
    setFormData((prev) => ({ ...prev, customer: { ...prev.customer, [field]: value } }));
  }, []);

  const handleSubmit = async () => {
    if (!canSubmitRepairIntake(formData, !!signatureData) || !signatureData) return;

    setIsSubmitting(true);
    setSubmitError(null);
    if (!repairIdemKey.current) repairIdemKey.current = safeRandomUUID();

    try {
      const r = await fetch('/api/kiosk/repair/submit', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': repairIdemKey.current,
        },
        body: JSON.stringify({
          ...formData,
          signatureDataUrl: signatureData.dataUrl,
          signatureStrokes: signatureData.strokes,
        }),
      });

      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error?.trim() || 'Failed to submit repair');
      }

      const result = (await r.json()) as RepairSubmitResult;
      setShowPaperwork(false);
      setSubmitted(result);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error submitting repair');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    const issueText = [...formData.repairReasons, formData.repairNotes].filter(Boolean).join(', ');
    const receiptProps = buildRepairIntakeReceiptProps(
      formData,
      issueText,
      formatReceiptToday(),
      submitted.zendeskTicketNumber ?? '',
    );

    return (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-center bg-emerald-50 py-4 text-emerald-700">
          <Check className="mr-2 h-5 w-5" />
          <span className="font-semibold uppercase tracking-widest text-emerald-800">
            Repair Submitted
            {submitted.zendeskTicketNumber ? `: Ticket ${submitted.zendeskTicketNumber}` : ''}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto bg-surface-sunken p-6">
          <RepairPaperworkCanvas>
            <RepairServiceForm {...receiptProps} surface="screen" />
          </RepairPaperworkCanvas>
        </div>
        <div className="shrink-0 border-t border-border-soft bg-surface-card p-6">
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              repairIdemKey.current = null;
              setSubmitted(null);
              setSignatureData(null);
              setShowPaperwork(false);
              setFormData(buildInitialFormData());
              onReset();
            }}
          >
            Done / Next Customer
          </Button>
        </div>
      </div>
    );
  }

  const SECTION_LABEL = 'text-role-micro uppercase tracking-[0.16em] text-text-soft';
  const blockReason = getRepairSubmitBlockReason(formData, !!signatureData);
  const canSubmit = canSubmitRepairIntake(formData, !!signatureData);
  const issueText = [...formData.repairReasons, formData.repairNotes].filter(Boolean).join(', ');
  const draftReceiptProps = buildRepairIntakeReceiptProps(formData, issueText, formatReceiptToday());

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border-soft bg-surface-card p-5">
        <h2 className="min-w-0 flex-1 text-lg font-semibold tracking-tight">Repair Details</h2>
        <RepairPaperworkSheet
          active={showPaperwork}
          onToggle={() => setShowPaperwork((v) => !v)}
          disabled={!hasProduct}
        />
      </div>

      <div
        className={`min-h-0 flex-1 overflow-y-auto ${
          showPaperwork && hasProduct ? 'bg-surface-sunken' : 'p-6 sm:p-8'
        }`}
      >
        {!hasProduct ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-text-default">No product selected</h3>
              <p className="mt-2 text-text-soft">
                Select a repair service from the left catalog to begin intake.
              </p>
            </div>
          </div>
        ) : showPaperwork ? (
          <div className="px-4 py-4 sm:px-6 sm:py-5">
            <RepairPaperworkCanvas>
              <RepairServiceForm {...draftReceiptProps} surface="screen" />
            </RepairPaperworkCanvas>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl space-y-12">
            <section className="space-y-4">
              <h3 className={SECTION_LABEL}>1. Issue Details</h3>
              <div className="rounded-xl border border-border-soft bg-surface-card p-5">
                <ReasonSelector
                  selectedReasons={formData.repairReasons}
                  notes={formData.repairNotes}
                  onReasonsChange={(reasons) =>
                    setFormData((prev) => ({ ...prev, repairReasons: reasons }))
                  }
                  onNotesChange={(notes) => setFormData((prev) => ({ ...prev, repairNotes: notes }))}
                  skuIssues={skuIssues}
                />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className={SECTION_LABEL}>2. Customer Information</h3>
              <div className="rounded-xl border border-border-soft bg-surface-card p-5">
                <CustomerInfoForm
                  customer={formData.customer}
                  serialNumber={formData.serialNumber}
                  price={formData.price}
                  notes={formData.notes}
                  activeField={CONTACT_FIELDS[CONTACT_FIELDS.length - 1]}
                  fieldIndex={CONTACT_FIELDS.length - 1}
                  fieldCount={CONTACT_FIELDS.length}
                  onCustomerChange={updateCustomer}
                  onSerialNumberChange={(value) =>
                    setFormData((prev) => ({ ...prev, serialNumber: value }))
                  }
                  onPriceChange={(value) => setFormData((prev) => ({ ...prev, price: value }))}
                  onNotesChange={(value) => setFormData((prev) => ({ ...prev, notes: value }))}
                />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className={SECTION_LABEL}>3. Authorization</h3>
              <div className="rounded-xl border border-border-soft bg-surface-card p-5">
                <SignaturePad
                  variant="dropoff"
                  label="Sign to authorize the service"
                  allowFullscreen
                  onSignatureChange={setSignatureData}
                />
              </div>
            </section>

            <section className="space-y-3 pt-4">
              {submitError && (
                <p className="text-center font-semibold text-text-danger">{submitError}</p>
              )}
              <Button
                size="lg"
                className="w-full"
                disabled={!canSubmit || isSubmitting}
                onClick={() => void handleSubmit()}
                title={blockReason}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting…
                  </>
                ) : (
                  'Submit repair'
                )}
              </Button>
              {blockReason && !submitError && (
                <p className="text-center text-sm font-semibold text-text-soft">{blockReason}</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
