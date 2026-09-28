'use client';

/**
 * RepairPickupFlow — the desk pickup sign-off, wearing the kiosk v2 face.
 * Operator 2026-09-24: *"desk sign off via the kiosk v2 components"*. The desk
 */

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, Check, X } from '../Icons';
import { SignaturePad, type SignatureData } from '@/components/ui/SignaturePad';
import { KioskPaneForm } from '@/components/kiosk/KioskPaneForm';
import { KioskEntryField } from '@/components/kiosk/KioskEntryField';
import { KioskChip } from '@/components/kiosk/KioskChip';
import { RepairPaperworkCanvas } from '@/components/repair/RepairPaperworkCanvas';
import RepairServiceForm from '@/components/repair/RepairServiceForm';
import { KIOSK_META } from '@/app/kiosk/kiosk-chrome';
import { KIOSK_POS_CTA, KIOSK_POS_CTA_SECONDARY } from '@/app/kiosk/kiosk-pos-surface';
import { Button } from '@/design-system/primitives';
import { useBodyScrollLock } from '@/design-system/hooks';
import { refreshDomains } from '@/lib/refresh/bus';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import { PICKUP_TERMS, submitRepairPickup } from '@/lib/repair/pickup-submit';
import {
  PICKUP_DECLINE_DETAIL_MAX,
  PICKUP_DECLINE_REASONS,
  composeDeclinedReason,
  intakeSignatureUrl,
  pickupReviewPaperwork,
  pickupSignoffInput,
  type PickupDeclineReason,
  type RepairDocumentRow,
} from '@/lib/repair/pickup-signoff';
import type { RSRecord } from '@/lib/neon/repair-service-queries';
import { qk } from '@/queries/keys';
import { cn } from '@/utils/_cn';

interface RepairPickupFlowProps {
  repair: RSRecord;
  /** Called after a successful pickup / decline — caller refreshes its data. */
  onUpdate: () => void;
  /** Close the overlay. */
  onClose: () => void;
}

type Step = 'signer' | 'sign' | 'decline' | 'review' | 'receipt';

/** Which of the two final paths the review step is confirming. */
type Path = 'signed' | 'declined';

/** Completed units per step — the band's `n` (PG6: never the step index). */
const STEP_DONE: Record<Exclude<Step, 'receipt'>, number> = {
  signer: 0,
  sign: 1,
  decline: 1,
  review: 2,
};

const STEP_HEADING: Record<Exclude<Step, 'receipt'>, string> = {
  signer: 'Who is collecting?',
  sign: 'Sign to confirm pickup',
  decline: 'Why no signature?',
  review: 'Review & submit',
};

async function fetchRepairDocuments(repairId: number): Promise<RepairDocumentRow[]> {
  const res = await fetch(`/api/repair-service/document/${repairId}`);
  if (!res.ok) throw new Error(`documents ${res.status}`);
  const body = (await res.json()) as { documents?: RepairDocumentRow[] };
  return body.documents ?? [];
}

export function RepairPickupFlow({ repair, onUpdate, onClose }: RepairPickupFlowProps) {
  // Already Done → straight to the receipt: staff re-open so the customer can
  // re-photograph the paper.
  const alreadyDone = (repair.status || '').trim().toLowerCase() === 'done';
  const [step, setStep] = useState<Step>(alreadyDone ? 'receipt' : 'signer');
  const [path, setPath] = useState<Path>('signed');
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null);
  const [declineChoice, setDeclineChoice] = useState<PickupDeclineReason | null>(null);
  const [declineDetail, setDeclineDetail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customerName = useMemo(() => resolveRepairContact(repair).name ?? '', [repair]);
  // Seeded once from the customer contact — a representative may collect, so
  // staff edit it. Not re-seeded from `repair`: a refetch mid-signing must not
  // overwrite what staff typed.
  const [signerName, setSignerName] = useState(customerName);
  const paperwork = useMemo(() => pickupReviewPaperwork(repair), [repair]);
  const rsCode = `RS-${repair.id}`;

  const documents = useQuery({
    queryKey: qk.repairs.documents(repair.id),
    queryFn: () => fetchRepairDocuments(repair.id),
    enabled: !alreadyDone,
    staleTime: 60_000,
  });
  const dropoffSignatureUrl = useMemo(
    () => intakeSignatureUrl(documents.data ?? []),
    [documents.data],
  );

  useBodyScrollLock(true);

  const declinedReason = composeDeclinedReason(declineChoice, declineDetail);
  const outcome = pickupSignoffInput({
    repairId: repair.id,
    signerName,
    signature: path === 'signed' ? signatureData : null,
    declinedReason: path === 'declined' ? declinedReason : null,
  });

  /**
   * Leaving for the pad always starts from a blank pad: `SignaturePad` remounts
   * empty, so a kept `signatureData` would be ink the screen no longer shows.
   */
  const go = (next: Step) => {
    if (next === 'sign' || next === 'decline') setSignatureData(null);
    setError(null);
    setStep(next);
  };

  const handleSubmit = async () => {
    if (!outcome.ok || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await submitRepairPickup(outcome.input);
      refreshDomains(['repairs']);
      onUpdate();
      setStep('receipt');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pickup failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === 'receipt') {
    return (
      <div className="fixed inset-0 z-panelOverlay flex flex-col overflow-hidden bg-surface-card">
        <div className="shrink-0 flex items-center justify-between border-b border-border-hairline px-6 py-4 bg-emerald-50">
          <div className="flex items-center gap-3">
            <Camera className="h-5 w-5 text-emerald-600" />
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-text-default">
                Take a photo of this receipt to keep a copy
              </h2>
              <p className="mt-0.5 text-role-micro text-text-soft">
                {rsCode} — {signerName.trim() || customerName || 'Customer'} — pickup complete
              </p>
            </div>
          </div>
          <Button
            variant="brand"
            onClick={onClose}
            icon={<X className="h-3 w-3" />}
            className="bg-surface-inverse bg-none text-role-micro hover:bg-surface-inverse-hover"
          >
            Done
          </Button>
        </div>

        <div className="flex-1 min-h-0 bg-surface-sunken overflow-hidden">
          {/* ds-allow-title: iframe title is the required accessible name, not a hover tooltip */}
          <iframe
            src={`/api/repair-service/print/${repair.id}`}
            title={`Repair receipt ${rsCode}`}
            className="h-full w-full border-0 bg-surface-card"
          />
        </div>
      </div>
    );
  }

  // The step before this one (the Who step has no Back — its X exits).
  const backTo: Step =
    step === 'review' ? (path === 'signed' ? 'sign' : 'decline') : step === 'decline' ? 'sign' : 'signer';
  const back = (
    <Button variant="ghost" size="lg" onClick={() => go(backTo)} data-testid="repair-pickup-back">
      ‹ Back
    </Button>
  );

  const footer =
    step === 'signer' ? (
      <Button
        size="lg"
        className={KIOSK_POS_CTA}
        disabled={!signerName.trim()}
        onClick={() => go('sign')}
        data-testid="repair-pickup-continue"
      >
        Continue
      </Button>
    ) : step === 'sign' ? (
      <>
        {back}
        <Button
          variant="secondary"
          size="lg"
          className={KIOSK_POS_CTA_SECONDARY}
          onClick={() => {
            setPath('declined');
            go('decline');
          }}
          data-testid="repair-pickup-decline"
        >
          Declined to sign
        </Button>
        <Button
          size="lg"
          className={KIOSK_POS_CTA}
          disabled={!signatureData}
          onClick={() => {
            setPath('signed');
            setStep('review');
          }}
          data-testid="repair-pickup-continue"
        >
          Continue
        </Button>
      </>
    ) : step === 'decline' ? (
      <>
        {back}
        <Button
          size="lg"
          className={KIOSK_POS_CTA}
          disabled={!declinedReason}
          onClick={() => {
            setPath('declined');
            setStep('review');
          }}
          data-testid="repair-pickup-continue"
        >
          Continue
        </Button>
      </>
    ) : (
      <>
        {back}
        <Button
          variant="warning"
          size="lg"
          className={KIOSK_POS_CTA}
          disabled={!outcome.ok || isSubmitting}
          title={outcome.ok ? undefined : outcome.reason}
          onClick={() => void handleSubmit()}
          data-testid="repair-pickup-submit"
        >
          {isSubmitting ? 'Submitting…' : 'Submit pickup'}
        </Button>
      </>
    );

  return (
    <div
      className="fixed inset-0 z-panelOverlay flex flex-col overflow-hidden bg-surface-card"
      data-repair-pickup-step={step}
    >
      <KioskPaneForm
        testId="repair-pickup-flow"
        progress={{
          current: STEP_DONE[step],
          total: 3,
          onClose,
          closeLabel: 'Back to repair',
          label: 'Pickup sign-off progress',
        }}
        footer={footer}
      >
        <div className="flex flex-col gap-1 px-4 pb-3 pt-5">
          <h2 className="min-w-0 text-left text-role-display font-bold text-text-default">
            {STEP_HEADING[step]}
          </h2>
          <p className={KIOSK_META}>
            {rsCode} · {repair.product_title || 'Repair'}
            {repair.price ? ` · $${repair.price}` : ''}
          </p>
        </div>

        {step === 'signer' ? (
          <div className="flex flex-col gap-2 px-4 pb-4">
            <KioskEntryField
              name="Signer name"
              value={signerName}
              onChange={setSignerName}
              autoComplete="off"
              testId="repair-pickup-signer"
              onEnter={signerName.trim() ? () => go('sign') : undefined}
            />
            <p className={KIOSK_META}>
              The customer, or the representative collecting for them.
            </p>
          </div>
        ) : null}

        {step === 'sign' ? (
          <div className="flex flex-col gap-4 px-4 pb-6">
            <p className="text-sm leading-relaxed text-text-default">{PICKUP_TERMS}</p>
            <SignaturePad
              variant="dropoff"
              label={`Signed by ${signerName.trim()}`}
              allowFullscreen
              onSignatureChange={setSignatureData}
            />
          </div>
        ) : null}

        {step === 'decline' ? (
          <div className="flex flex-col gap-1.5 px-3 pb-4">
            {PICKUP_DECLINE_REASONS.map((reason) => {
              const selected = declineChoice === reason;
              return (
                <KioskChip
                  key={reason}
                  face="row"
                  tone={selected ? 'issue' : 'idle'}
                  selected={selected}
                  onClick={() => setDeclineChoice(selected ? null : reason)}
                  trailing={
                    selected ? <Check className="h-4 w-4 shrink-0 text-amber-800" aria-hidden /> : null
                  }
                >
                  {reason}
                </KioskChip>
              );
            })}
            <div className="px-1 pt-2">
              <KioskEntryField
                name={declineChoice ? 'Details (optional)' : 'Or describe why'}
                value={declineDetail}
                onChange={setDeclineDetail}
                maxLength={PICKUP_DECLINE_DETAIL_MAX}
                multiline
                testId="repair-pickup-decline-detail"
              />
            </div>
          </div>
        ) : null}

        {step === 'review' ? (
          <div className="flex flex-col gap-4 px-4 pb-6">
            {/* THE PAPERWORK, not a summary of it — the kiosk review ruling
                (operator 2026-09-15). The pickup band carries the live ink;
                a declined pickup leaves it ruled and empty, as it prints. */}
            <RepairPaperworkCanvas align="full" frame="bordered">
              <RepairServiceForm
                surface="screen"
                density="compact"
                sections="full"
                dropoffSignatureUrl={dropoffSignatureUrl}
                pickupSignatureUrl={path === 'signed' ? (signatureData?.dataUrl ?? null) : null}
                {...paperwork}
              />
            </RepairPaperworkCanvas>
            <p className={cn('text-center', KIOSK_META)} data-testid="repair-pickup-review-summary">
              Collected by {signerName.trim()}
              {path === 'declined' && declinedReason
                ? ` — no signature: “${declinedReason}”.`
                : '.'}
            </p>
            {error ? (
              <p className="text-center text-sm font-semibold text-text-danger" role="alert">
                {error}
              </p>
            ) : !outcome.ok ? (
              <p className="text-center text-sm font-semibold text-text-soft">{outcome.reason}</p>
            ) : null}
          </div>
        ) : null}
      </KioskPaneForm>
    </div>
  );
}
