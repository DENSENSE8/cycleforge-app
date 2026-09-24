'use client';

import { useState } from 'react';
import { BottomSheet, ConfirmSheet } from '@/components/ui/BottomSheet';
import { SignaturePad, type SignatureData } from '@/components/ui/SignaturePad';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Check, ExternalLink } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { refreshDomains } from '@/lib/refresh/bus';
import { resolveRepairContact } from '@/lib/repair/contact-info';
import { PICKUP_TERMS, submitRepairPickup } from '@/lib/repair/pickup-submit';
import type { RSRecord } from '@/lib/neon/repair-service-queries';

type ConfirmKind = 'signed' | 'declined';

interface DoneState {
  signer: string | null;
  /** True only when THIS session's write landed — a re-opened Done repair is not a new pickup. */
  pickedNow: boolean;
  declined: boolean;
  warning: string | null;
}

/**
 * Pickup verb of the mobile repair workbench — the phone twin of the desk's
 * `RepairPickupFlow`, on the same write (`submitRepairPickup`).
 *
 * Opening never writes. Both final paths (signed, declined-with-reason) go
 * through one `ConfirmSheet`, and only its confirm handler posts — the write
 * closes the repair as Done, stamps pickup time and closes the work
 * assignment, so it is never one stray tap. A repair already Done opens
 * straight on the receipt state (re-open for the receipt, as on desktop).
 *
 * Full-screen with drag-to-dismiss disabled: the signature canvas would
 * otherwise fight the sheet's drag gesture.
 */
export function RepairPickupSheet({
  open,
  repair,
  onClose,
  onPicked,
}: {
  open: boolean;
  repair: RSRecord;
  onClose: () => void;
  /** Called after the server confirmed pickup; the page refetches the repair. */
  onPicked: () => void;
}) {
  const [seededOpen, setSeededOpen] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [signature, setSignature] = useState<SignatureData | null>(null);
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DoneState | null>(null);

  // Re-seed on each open transition only — a live refetch of `repair` while
  // the customer is signing must not wipe the form out from under the pad.
  if (open !== seededOpen) {
    setSeededOpen(open);
    if (open) {
      const contactName = resolveRepairContact(repair).name ?? '';
      setSignerName(contactName);
      setSignature(null);
      setDeclining(false);
      setDeclineReason('');
      setConfirmKind(null);
      setSubmitting(false);
      setError(null);
      setDone(
        (repair.status || '').trim().toLowerCase() === 'done'
          ? { signer: contactName || null, pickedNow: false, declined: false, warning: null }
          : null,
      );
    }
  }

  const rsCode = `RS-${repair.id}`;
  const receiptUrl = `/api/repair-service/print/${repair.id}`;
  const signer = signerName.trim();
  const reason = declineReason.trim();
  const canSubmitSigned = !!signature && signer.length > 0 && !submitting;
  const canSubmitDeclined = reason.length > 0 && !submitting;

  const handleClose = () => {
    if (submitting) return;
    if (done?.pickedNow) onPicked();
    onClose();
  };

  const confirmPickup = async (kind: ConfirmKind) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitRepairPickup({
        repairId: repair.id,
        signerName: signer || null,
        signature: kind === 'signed' ? signature : null,
        declinedReason: kind === 'declined' ? reason : null,
      });
      refreshDomains(['repairs']);
      setDone({
        signer: signer || null,
        pickedNow: true,
        declined: result.declined,
        warning: result.signatureWarning,
      });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Pickup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const startDecline = () => {
    setDeclining(true);
    setSignature(null);
    setError(null);
  };

  const cancelDecline = () => {
    setDeclining(false);
    setDeclineReason('');
    setError(null);
  };

  const confirmMessage =
    `This closes ${rsCode} as Done, stamps the pickup time now and closes its work assignment.` +
    (confirmKind === 'declined' ? ` No signature — recorded reason: “${reason}”.` : '');

  return (
    <>
      <BottomSheet
        open={open}
        onClose={handleClose}
        forceVariant="sheet"
        fullScreen
        dragDisabled
        title="Pickup sign-off"
      >
        {/* BottomSheet portals out of the page's ModeRegion; re-declare triage so
            the mode radius / padding / hit tokens resolve inside the sheet. */}
        <ModeRegion mode="triage" className="flex min-h-0 flex-1 flex-col gap-3 pb-2">
          <div className="rounded-mode border border-mode-edge bg-mode-panel px-mode-page py-2.5">
            <p className="text-mode-body font-semibold text-mode-ink">
              {rsCode}
              {repair.price ? <span className="ml-2 text-emerald-700">${repair.price}</span> : null}
            </p>
            <p className="truncate text-role-caption text-mode-muted">{repair.product_title || 'Repair'}</p>
          </div>

          {done ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3 rounded-mode border border-emerald-200 bg-emerald-50 px-mode-page py-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <div className="min-w-0">
                  <p className="text-mode-body font-semibold text-emerald-900">
                    {done.signer ? `Picked up · ${done.signer}` : 'Picked up'}
                  </p>
                  <p className="text-role-caption text-emerald-800">
                    {done.pickedNow
                      ? done.declined
                        ? `${rsCode} is Done. Recorded without a signature.`
                        : `${rsCode} is Done. Signature saved.`
                      : `${rsCode} was already picked up.`}
                  </p>
                </div>
              </div>
              {done.warning ? (
                <p role="status" className="rounded-mode border border-amber-200 bg-amber-50 px-mode-page py-2.5 text-role-caption font-semibold text-amber-800">
                  {done.warning}
                </p>
              ) : null}
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-mode-hit items-center justify-center gap-2 rounded-mode border border-mode-control bg-mode-panel px-mode-page text-mode-body font-semibold text-mode-ink active:bg-mode-hover"
              >
                <ExternalLink className="h-4 w-4" />
                Open receipt
              </a>
              <Button variant="primary" size="lg" className="w-full rounded-mode" onClick={handleClose}>
                Done
              </Button>
            </div>
          ) : (
            <>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="repair-pickup-signer" className="text-mode-ink">
                    Signer / representative
                  </Label>
                  <Input
                    id="repair-pickup-signer"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                    disabled={submitting}
                    autoComplete="off"
                    autoCapitalize="words"
                    className="min-h-mode-hit rounded-mode border-mode-control bg-mode-panel text-mode-body text-mode-ink"
                  />
                  <p className="text-role-caption text-mode-muted">
                    Who is collecting — edit if a representative picks up.
                  </p>
                </div>

                <p className="text-role-caption italic leading-relaxed text-mode-muted">{PICKUP_TERMS}</p>

                {declining ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="repair-pickup-decline-reason" className="text-mode-ink">
                      Why did the customer decline to sign?
                    </Label>
                    <Textarea
                      id="repair-pickup-decline-reason"
                      value={declineReason}
                      onChange={(e) => setDeclineReason(e.target.value)}
                      disabled={submitting}
                      required
                      rows={3}
                      className="rounded-mode border-mode-control bg-mode-panel text-mode-body text-mode-ink"
                    />
                    <p className="text-role-caption text-mode-muted">Required — recorded in the audit trail.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {/* Fixed-height box: the pad fills it (staff mount), the export is cropped to the ink either way. */}
                    <div className="h-[220px] w-full">
                      <SignaturePad onSignatureChange={setSignature} fillHeight label="Pickup signature" />
                    </div>
                    {!signature ? (
                      <p className="text-role-caption font-semibold text-amber-700">Signature required to record pickup</p>
                    ) : null}
                  </div>
                )}
              </div>

              {error ? (
                <p role="alert" className="rounded-mode border border-rose-200 bg-rose-50 px-mode-page py-2.5 text-role-caption font-semibold text-rose-700">
                  Not recorded — {error}
                </p>
              ) : null}

              <div className="flex shrink-0 flex-col gap-2">
                {declining ? (
                  <>
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full rounded-mode"
                      disabled={!canSubmitDeclined}
                      loading={submitting}
                      onClick={() => setConfirmKind('declined')}
                    >
                      Record pickup without signature
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full rounded-mode"
                      disabled={submitting}
                      onClick={cancelDecline}
                    >
                      Back to signature
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      size="lg"
                      className="w-full rounded-mode"
                      disabled={!canSubmitSigned}
                      loading={submitting}
                      onClick={() => setConfirmKind('signed')}
                    >
                      Record pickup
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full rounded-mode"
                      disabled={submitting}
                      onClick={startDecline}
                    >
                      Customer declined to sign
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </ModeRegion>
      </BottomSheet>

      <ConfirmSheet
        open={confirmKind !== null}
        onClose={() => setConfirmKind(null)}
        title="Record pickup?"
        message={confirmMessage}
        confirmLabel="Record pickup"
        onConfirm={() => {
          if (confirmKind) void confirmPickup(confirmKind);
        }}
      />
    </>
  );
}
