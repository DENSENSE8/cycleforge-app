'use client';

/**
 * Landscape repair details — edits a REPAIR line on the session cart.
 * Does not post to the API; Pay / Save on {@link KioskCartLedger} submits the
 * whole polymorphic cart via `/api/kiosk/intake`.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/design-system/primitives';
import { Printer, Receipt } from '@/components/Icons';
import { KioskPaneForm } from '@/components/kiosk/KioskPaneForm';
import { KioskReasonStep } from '@/components/repair/KioskReasonStep';
import { KioskTicketStep } from '@/components/kiosk/KioskTicketStep';
import { KioskCustomerIntake, KioskEntryField } from '@/components/kiosk/KioskCustomerIntake';
import { RepairPaperworkCanvas } from '@/components/repair/RepairPaperworkCanvas';
import RepairServiceForm from '@/components/repair/RepairServiceForm';
import { buildRepairIntakeReceiptProps } from '@/lib/repair/repair-intake-receipt';
import { SignaturePad, type SignatureData } from '@/components/repair/SignaturePad';
import type { ProductSelection } from '@/components/repair/ProductSelector';
import type { RepairFormData } from '@/components/repair/RepairIntakeForm';
import {
  buildInitialFormData,
  canSubmitRepairIntake,
  getRepairSubmitBlockReason,
  repairStepGates,
} from '@/components/repair/repair-intake-logic';
import {
  useKioskSession,
  useKioskSessionActions,
} from '@/lib/kiosk/kiosk-session-store';
import {
  repairLinePayload,
  repairPriceToCents,
} from '@/lib/kiosk/repair-line-payload';
import { isKioskTicketChoiceSettled } from '@/lib/kiosk/repair-ticket-choice';
import { useNextTicketPreview } from '@/lib/kiosk/use-next-ticket-preview';
import { printDomNode } from '@/lib/print/print-dom-node';
import { isRepairPayload } from '@/lib/kiosk/cart-line';
import { KIOSK_META } from '@/app/kiosk/kiosk-chrome';
import { KIOSK_POS_CTA } from '@/app/kiosk/kiosk-pos-surface';
import { cn } from '@/utils/_cn';

interface KioskRepairPaneProps {
  selectedProduct: ProductSelection | null;
  /** Catalog price from the selection — empty until a priced SKU is picked. */
  price: string;
  /**
   * Exit the step flow back to the repair catalog — the X in the pane's step
   * band and the trailing "Add" key. REQUIRED: the flow has no other way out,
   * and the optional form is what left a dead titled-band branch behind.
   */
  onBack: () => void;
}

/**
 * The four step headers, in order — each the step's own question in plain
 * words. Operator 2026-09-14: no "Issue" eyebrow, no duplicate label inside
 * the step body; ONE bold display header, top-left.
 *
 * Device split from Contact 2026-09-15 (operator): *"there should be contact
 * information just as phone number name email address and address with serial
 * number and price under a different stepper."* Two subjects, two steps — the
 * staffer reads the serial and quotes the price, the customer gives their own
 * details.
 *
 * There is deliberately NO fifth "Support ticket" step. The create-or-link
 * question was one for an hour on 2026-09-15 and the operator collapsed it:
 * *"because the stepper is full at that review and sign step, would it be best
 * to include a slider … below the signature so it would be mounted under one
 * step?"* The ticket is ABOUT the paperwork on the review screen, so paging
 * away from that sheet to ask about it — and spending a whole progress segment
 * on one tap — was the wrong altitude. It is revealed by the signature inside
 * this step instead; `repairStepGates[3]` still demands the answer.
 */
const STEP_HEADERS = [
  'Reason for repair',
  'Device & quote',
  'Contact information',
  'Review & sign',
] as const;

export function KioskRepairPane({ selectedProduct, price, onBack }: KioskRepairPaneProps) {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  const [formData, setFormData] = useState<RepairFormData>(() => buildInitialFormData());
  const [signatureData, setSignatureData] = useState<SignatureData | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const flashTimer = useRef<number | null>(null);
  /**
   * The A4 print-layout copy of the paperwork, for the print icon.
   *
   * Printing the LIVE node is the only option pre-submit:
   * `/api/repair-service/print/[id]` needs a persisted `repair_service.id`,
   * which does not exist until the cart submits. See `print-dom-node.ts`, and
   * the comment at the mount for why this is a separate node from the sheet
   * the customer reads.
   */
  const printSheetRef = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );
  /** SKU the step-0 reason vocabulary is scoped to (null for an "Other" pick). */
  const sourceSku = selectedProduct?.sourceSku?.trim() || null;
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

  /*
   * Contact fields are VISIT facts: they live on the session root, which is
   * what the cart, the triage panel and the submit all read. `formData.customer`
   * mirrors the three the repair line's own gate checks.
   *
   * ADDRESS is deliberately not mirrored — `RepairFormData` has no address
   * field and must not grow one. Widening a LINE form with a visit-level fact
   * is how two sources of one truth start, and the cart already writes this
   * exact key. So it is read from and written to the session directly.
   */
  const updateCustomer = useCallback(
    (field: string, value: string) => {
      if (field === 'address') {
        actions.setCustomer({ address: value });
        return;
      }
      setFormData((prev) => ({ ...prev, customer: { ...prev.customer, [field]: value } }));
      if (field === 'phone') actions.setCustomer({ phone: value });
      if (field === 'name') actions.setCustomer({ name: value });
      if (field === 'email') actions.setCustomer({ email: value });
    },
    [actions],
  );

  /**
   * The line this pane would commit right now. ONE builder — it used to be an
   * object literal inside `saveToCart`, so nothing else could ask what the
   * cart was about to receive. See `repair-line-payload.ts`.
   */
  const linePayload = useMemo(
    () =>
      repairLinePayload({
        formData,
        product: {
          type: selectedProduct?.type ?? '',
          model: selectedProduct?.model ?? '',
          sourceSku: selectedProduct?.sourceSku ?? null,
        },
        catalogPrice: price,
        signature: signatureData,
      }),
    [formData, selectedProduct, price, signatureData],
  );

  /*
   * `ticketChoice` is a VISIT fact on the session root, not a line fact — one
   * `ticketWork` per submit however many devices this customer dropped off.
   * See `src/lib/kiosk/repair-ticket-choice.ts`.
   *
   * SETTLED, not "complete": the slider opens on Create and an untouched
   * control is a real answer (operator 2026-09-15: *"automatically select
   * create new ticket"*), which is also what `kioskTicketWork` posts for an
   * untouched choice. The one state that blocks is HALF-FINISHED — slid to
   * Link with no ticket picked.
   */
  const ticketSettled = isKioskTicketChoiceSettled(session.ticketChoice);
  /*
   * ONE refusal sentence for this pane: the form's own gaps first
   * (`getRepairSubmitBlockReason` is the only copy deck for those), then the
   * open ticket question once the paperwork is signable — which is exactly
   * when the control that answers it appears under the signature.
   */
  const blockReason =
    getRepairSubmitBlockReason(formData, !!signatureData) ??
    (ticketSettled ? undefined : 'Pick the existing ticket to attach this repair to');
  const canSave = canSubmitRepairIntake(formData, !!signatureData) && ticketSettled;

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
  const stepGates = repairStepGates(formData, !!signatureData, ticketSettled);
  const stepCanContinue = stepGates[step] ?? canSave;
  const completedSteps = stepGates.filter(Boolean).length;

  /*
   * The support ticket the paperwork previews. Fetched only once the customer
   * is actually looking at the sheet — a tablet parked on step 0 has no reason
   * to ask the helpdesk anything.
   */
  const nextTicketId = useNextTicketPreview(step === lastStep);

  /**
   * The number the paperwork states.
   *
   * A LINKED ticket outranks the projection, because it is a FACT rather than
   * a guess: `ATTACH_TICKET` stamps `repair_service.ticket_number` with the
   * picked ticket (`ticket-outbox.ts`), so the printed sheet will carry that
   * number. Leaving the projection up here would have the review step and the
   * paper disagree the moment the customer chose to attach — the same defect
   * class as the hand-rolled review card that this step deleted.
   */
  const paperworkTicketId =
    session.ticketChoice?.mode === 'attach' && session.ticketChoice.ticketId > 0
      ? session.ticketChoice.ticketId
      : nextTicketId;

  /**
   * The paperwork's facts, built ONCE and handed to both the sheet the customer
   * reads and the A4 copy the print icon prints. Two mounts of one document
   * must not be able to state different facts.
   */
  const paperworkProps = useMemo(
    () =>
      buildRepairIntakeReceiptProps(
        formData,
        formData.repairReasons.join(', ') || formData.repairNotes,
        '',
        paperworkTicketId ?? '',
      ),
    [formData, paperworkTicketId],
  );

  /**
   * Commit the line to the cart.
   *
   * It does NOT leave the pane. The trailing `Add` key that did — commit, then
   * `onBack()` — came off the review floor on operator ruling 2026-09-15, and
   * its commit-before-leaving path went with it rather than staying as an
   * unused parameter. The lesson it encoded still applies to anything added
   * here later: `onBack` UNMOUNTS this pane (the catalog renders it only in
   * `checkout`), so `formData`, `signatureData` and `step` die with it. A key
   * that leaves without calling this first destroys a customer's signature.
   */
  const saveToCart = () => {
    if (!hasProduct || !selectedProduct) return;
    const unitAmountCents = repairPriceToCents(linePayload.price);
    const title = selectedProduct.model;

    if (activeLineId || existingRepair) {
      const id = activeLineId ?? existingRepair!.id;
      actions.updateRepairLine(id, { title, unitAmountCents, payload: linePayload });
      setActiveLineId(id);
    } else {
      const line = actions.addRepair({ title, unitAmountCents, payload: linePayload });
      setActiveLineId(line.id);
    }
    actions.setCustomer({
      phone: formData.customer.phone,
      name: formData.customer.name,
      email: formData.customer.email,
    });
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    setSavedFlash(true);
    flashTimer.current = window.setTimeout(() => setSavedFlash(false), 1500);
  };

  return (
    <KioskPaneForm
      testId="kiosk-repair-pane"
      progress={{
        current: completedSteps,
        total: steps.length,
        onClose: onBack,
        closeLabel: 'Back to catalog',
        label: 'Repair intake progress',
      }}
      hero={
        hasProduct ? undefined : (
          <div className="text-center">
            <h3 className="text-lg font-semibold text-text-default">No product selected</h3>
            <p className="mt-2 text-text-soft">
              Select a repair service from the catalog to begin intake.
            </p>
          </div>
        )
      }
      footer={
        hasProduct ? (
          <>
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
              /*
                ONE key on the review floor. The trailing `Add` (pencil +
                "Add") is GONE — operator 2026-09-15: *"remove the add bottom
                right of the review and save."* It existed to start a second
                device without losing the first, which is now moot: the step
                shows the paperwork the customer is signing, and the way to a
                second device is the catalog via the step band's X.

                ORANGE, and named for the job: operator 2026-09-15 — *"save to
                cart CTA button at the most bottom should be an orange submit
                repair button."* `variant="warning"` is the amber intent from
                the Button fill map, which is also the ink the repair command
                wears in the mode selector (`KioskServiceTile.iconTone`), so
                the commit key reads as the same lane as the command that
                opened it. Never a `className` hue override — AGENTS.md: grow
                the map, do not paint over the primitive. `KIOSK_POS_CTA`
                still states `shadow-none`, so the variant's own `shadow-sm`
                is neutralised and the key keeps casting nothing.

                MECHANICALLY it commits the repair to this visit's ticket —
                the helpdesk row and any payment happen when the CART submits
                (`KioskCartLedger` → `/api/kiosk/intake`). The label is the
                operator's word for the counter's job, not a claim that the
                provider has been called; the ticket work is queued through the
                outbox either way.
              */
              <Button
                variant="warning"
                size="lg"
                className={KIOSK_POS_CTA}
                disabled={!canSave}
                onClick={() => saveToCart()}
                title={blockReason ?? undefined}
                data-testid="kiosk-repair-submit"
              >
                {savedFlash ? 'Repair submitted' : 'Submit repair'}
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      <div data-kiosk-repair-step={step}>
            {step === 0 ? (
              <KioskReasonStep
                heading={STEP_HEADERS[0]}
                sourceSku={sourceSku}
                selectedReasons={formData.repairReasons}
                notes={formData.repairNotes}
                onReasonsChange={(reasons) =>
                  setFormData((prev) => ({ ...prev, repairReasons: reasons }))
                }
                onNotesChange={(notes) =>
                  setFormData((prev) => ({ ...prev, repairNotes: notes }))
                }
              />
            ) : (
              /*
                Steps 1-3 keep the same bold display header, top-left; step 0
                owns its own because the Add CTA rides that row.

                It is a ROW with a trailing slot, not a bare heading. Operator
                2026-09-15: *"button should not display in a second row, it
                should display in the same row as review and sign."* The print
                CTA was its own full-width `justify-end` strip below the
                heading — a second row for one glyph, and vertically unaligned
                with the title it belongs to. Steps 1 and 2 pass nothing and
                render exactly as before: same inset, same face, no phantom
                slot.

                Body content, NOT a band. `KioskPaneForm` has no title face and
                the pane owns ONE header — the step band. Reaching back for the
                retired pane-header-band tokens here re-opens the double-band
                bug (`kiosk-pane-frame.test.ts` guards it, by name).
              */
              <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-5">
                <h2 className="min-w-0 text-left text-role-display font-bold text-text-default">
                  {STEP_HEADERS[step]}
                </h2>
                {step === lastStep ? (
                  /*
                    A LABELLED CTA, not a glyph in a box. Operator 2026-09-15:
                    *"ensure the print icon on the most right displays as a
                    text print and a print icon, just like the shipping CTA,
                    primary CTA on the top right. Should not be a boxy print
                    button."* So it is the ops `Button` — icon + word, the
                    primitive's own `radius="surface"` corner — where an
                    `IconButton size="touch"` was painting a square 44px tile.

                    It prints RIGHT NOW, the sheet on screen: the A4 copy of
                    this same render tree, never the compact sheet above (see
                    the print-source note below).
                  */
                  <Button
                    variant="primary"
                    size="md"
                    icon={<Printer />}
                    ariaLabel="Print this paperwork"
                    onClick={() =>
                      printDomNode(printSheetRef.current, {
                        title: `Repair Service${nextTicketId ? ` #${nextTicketId}` : ''}`,
                        name: 'kiosk-repair-review',
                      })
                    }
                    className="shrink-0"
                    data-testid="kiosk-repair-print"
                  >
                    Print
                  </Button>
                ) : null}
              </div>
            )}

            {/*
              DEVICE — what is being repaired and what it costs. The staffer's
              half of the form: the serial comes off the chassis, the price is
              the quote. The price field wears the house money mark (`Receipt`
              — the documented price glyph) in success green, so the field
              states its kind before anyone reads the placeholder (operator
              2026-09-15: "a green price icon").
            */}
            {step === 1 && (
              <div className="flex flex-col gap-3 bg-surface-card px-4 pb-4">
                <KioskEntryField
                  name="Serial number"
                  value={formData.serialNumber}
                  testId="kiosk-repair-serial"
                  onChange={(value) =>
                    setFormData((prev) => ({ ...prev, serialNumber: value }))
                  }
                />
                <KioskEntryField
                  name="Price"
                  value={formData.price}
                  inputMode="decimal"
                  icon={<Receipt className="h-4 w-4" />}
                  testId="kiosk-repair-price"
                  onChange={(value) => setFormData((prev) => ({ ...prev, price: value }))}
                />
                <KioskEntryField
                  name="Notes (optional)"
                  value={formData.notes}
                  multiline
                  testId="kiosk-repair-notes"
                  onChange={(value) => setFormData((prev) => ({ ...prev, notes: value }))}
                />
              </div>
            )}

            {/*
              CONTACT — the customer's half, and ONLY that: phone (the match
              key), name, email, address. No device facts ride along here any
              more; `extras` is deliberately unused on this channel.
            */}
            {step === 2 && (
              <KioskCustomerIntake
                entry
                fields={['phone', 'name', 'email', 'address']}
                heading={null}
                className="bg-surface-card pb-4"
                value={{
                  phone: formData.customer.phone,
                  name: formData.customer.name,
                  email: formData.customer.email,
                  address: session.customerAddress ?? '',
                }}
                onChange={(next) => {
                  updateCustomer('phone', next.phone);
                  updateCustomer('name', next.name);
                  updateCustomer('email', next.email);
                  updateCustomer('address', next.address ?? '');
                }}
              />
            )}

            {step === lastStep && (
              <div className="flex flex-col gap-4 bg-surface-card px-4 pb-6 pt-2">
                {/*
                  THE PAPERWORK, not a summary of it.

                  Operator 2026-09-15: *"it should just display the paperwork
                  instead of the hand-rolled review component. The paperwork is
                  better because it displays exactly what's going to be printed
                  out."* Right, and for a reason the hand-rolled card could
                  never fix: a summary is a SECOND rendering of the agreement,
                  so it can disagree with the sheet the customer signs.

                  `density="compact"` is the SCALE (this is a 512px form
                  column, not an A4 page); `sections="full"` is the
                  COMPLETENESS — internal-use table and the PICK UP signature
                  line at the bottom, per *"it should display the pickup
                  signature as well at the bottom of the paperwork"*. Those two
                  were one prop until this ruling.

                  The drop-off band carries the LIVE pad output, so the customer
                  watches their signature land on the document they are signing
                  (per stroke — `SignaturePad` emits on `endStroke`). Pickup
                  stays an empty rule: nobody has collected the unit yet.

                  Facts come from `buildRepairIntakeReceiptProps`, the existing
                  form → receipt mapper. No second derivation.
                */}
                <RepairPaperworkCanvas align="full" frame="bordered">
                  <RepairServiceForm
                    surface="screen"
                    density="compact"
                    sections="full"
                    dropoffSignatureUrl={signatureData?.dataUrl ?? null}
                    {...paperworkProps}
                  />
                </RepairPaperworkCanvas>
                {/*
                  THE PRINT SOURCE, and deliberately not the sheet above.

                  The visible sheet is `density="compact"` — column width, small
                  type, sized for a 512px form measure. Printing THAT would hand
                  the customer a signed document that is not the drop-off
                  paperwork: a THIRD rendering of the agreement, which is the
                  exact defect that got the hand-rolled review card deleted.

                  So the icon prints the A4 `surface="print"` layout of the SAME
                  component, with the same props and the same ink. One render
                  tree, two surfaces. It is parked off-viewport rather than
                  `hidden` because it has to LAY OUT to be printable;
                  `printDomNode` clears that positioning on its clone.

                  Known remaining fork, pre-existing and NOT introduced here:
                  `/api/repair-service/print/[id]` builds its own HTML template
                  rather than mounting this component, so the legal wording
                  lives in two places. Converging them is the real fix and is a
                  separate increment — see the report.
                */}
                <div
                  ref={printSheetRef}
                  aria-hidden
                  className="pointer-events-none"
                  style={{ position: 'absolute', left: '-10000px', top: 0, width: '210mm' }}
                >
                  <RepairServiceForm
                    surface="print"
                    density="full"
                    sections="full"
                    dropoffSignatureUrl={signatureData?.dataUrl ?? null}
                    {...paperworkProps}
                  />
                </div>
                {/*
                  Outside the sheet on purpose: the canvas must stay
                  print-faithful, and this is the one thing about the preview
                  that is NOT true of the paper.

                  Two sentences, because there are two different facts.

                  A LINKED ticket is certain: `ATTACH_TICKET` stamps
                  `repair_service.ticket_number` with the ticket the counter
                  picked, so the sheet above already carries the number that
                  will print.

                  A projection is not. "EXPECTED", never "reserved" — Zendesk
                  assigns ids at create time from a sequence shared with every
                  other source in the account, so a parallel intake can take
                  this number between the signature and the submit. Claiming a
                  reservation next to a signature would be the one sentence on
                  this screen the system cannot honour. The real id is stamped
                  by the CREATE_TICKET outbox drain and the print route reads
                  it from there — so the paper is always right, whatever this
                  line said.
                */}
                {session.ticketChoice?.mode === 'attach' &&
                session.ticketChoice.ticketId > 0 ? (
                  <p className={cn('text-center', KIOSK_META)}>
                    This drop-off attaches to support ticket #
                    {session.ticketChoice.ticketId} — the printed paperwork carries that
                    number.
                  </p>
                ) : nextTicketId !== null ? (
                  <p className={cn('text-center', KIOSK_META)}>
                    Next support ticket is expected to be #{nextTicketId} — the printed
                    paperwork carries the final number.
                  </p>
                ) : null}
                <SignaturePad
                  variant="dropoff"
                  label="Sign to authorize the service"
                  allowFullscreen
                  onSignatureChange={setSignatureData}
                />

                {/*
                  THE TICKET QUESTION — under the signature, inside this step.

                  It was briefly a FIFTH step. Operator 2026-09-15: *"because
                  the stepper is full at that review and sign step, would it be
                  best to include a slider like link existing ticket or create
                  a new ticket below the signature so it would be mounted under
                  one step?"* Yes — and it is the honest shape, because the
                  ticket is about the document on this screen. A separate step
                  paged the customer away from the paperwork to ask a question
                  about it, and it spent a whole progress segment on one tap.

                  REVEALED BY THE SIGNATURE, which is the original ruling kept
                  intact (*"after the customer has submitted their signature it
                  should display with a link existing ticket or create new
                  ticket"*): before there is ink there is nothing to file, so
                  the control is not there to be answered.

                  The decision is a VISIT fact on the session root, read and
                  written straight through rather than mirrored into
                  `formData`: `ticketWork` is transaction-level, one per submit
                  however many devices this customer dropped off. Same ruling
                  the address already follows.
                */}
                {signatureData ? (
                  <KioskTicketStep
                    choice={session.ticketChoice}
                    onChoose={actions.setTicketChoice}
                  />
                ) : null}

                {/* ONE refusal sentence on this floor: the form's own gaps
                    first, then the undecided ticket once the paperwork is
                    signable. The commit key's `title` is the same string, and
                    a tooltip is unreachable with a finger. */}
                {blockReason && (
                  <p className="text-center text-sm font-semibold text-text-soft">
                    {blockReason}
                  </p>
                )}
              </div>
            )}
      </div>
    </KioskPaneForm>
  );
}
