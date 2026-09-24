'use client';

/**
 * Landscape repair details — the VISIT's paperwork, and the key that submits it.
 *
 * ## One submit path (2026-09-16)
 *
 * This pane used to POST a device-authed repair endpoint of its own (deleted
 * 2026-09-16): one bare `repair_service` row, no counter header, no visit, no
 * payment. The cart POSTed
 * `/api/kiosk/intake`. So a drop-off checked in from here never became a
 * transaction the desk could see or charge, and a customer with a repair AND a
 * case on the counter could be checked in twice — whichever key the staffer
 * happened to press decided which, which is not a decision a key should make.
 *
 * "Submit repair" and the cart's Save/Pay are now the same verb at different
 * altitudes ({@link submitKioskVisit}), and there is exactly ONE success
 * document ({@link KioskCartDoneFace}). The pane's own paperwork-in-a-hero
 * success face is gone with the second endpoint.
 *
 * ## Per device, not per visit (2026-09-16)
 *
 * `repair_service` has always been one row per physical unit and the cart has
 * always held one REPAIR line per device; the UI was the only layer that
 * flattened. Step 1 is a REPEATER over {@link repairDevicesFromLines} — the
 * devices are derived from the cart (the session root), so they survive this
 * pane unmounting and cannot disagree with what the submit writes. Serial,
 * price and notes are DEVICE facts; reasons, contact, signature and the ticket
 * choice are VISIT facts, captured once and written onto every line.
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/design-system/primitives';
import { Plus, Receipt, Trash2 } from '@/components/Icons';
import { KioskPaneForm } from '@/components/kiosk/KioskPaneForm';
import { KioskReasonStep } from '@/components/repair/KioskReasonStep';
import { KioskTicketStep } from '@/components/kiosk/KioskTicketStep';
import { KioskCustomerIntake, KioskEntryField } from '@/components/kiosk/KioskCustomerIntake';
import { RepairPaperworkCanvas } from '@/components/repair/RepairPaperworkCanvas';
import RepairServiceForm from '@/components/repair/RepairServiceForm';
import { KioskCartDoneFace } from './KioskCartDoneFace';
import { repairReceiptPropsForDevice } from '@/lib/repair/repair-intake-receipt';
import { SignaturePad, type SignatureData } from '@/components/ui/SignaturePad';
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
import { repairPriceToCents } from '@/lib/kiosk/repair-line-payload';
import {
  repairDevicesFromLines,
  repairDevicesTotalCents,
  type KioskRepairDevice,
} from '@/lib/kiosk/repair-devices';
import { submitKioskVisit } from '@/lib/kiosk/submit-kiosk-visit';
import { formatCartCents } from '@/lib/kiosk/cart-card-view';
import { isKioskTicketChoiceSettled } from '@/lib/kiosk/repair-ticket-choice';
import { useNextTicketPreview } from '@/lib/kiosk/use-next-ticket-preview';
import { isRepairPayload, type KioskCartLine, type RepairPayload } from '@/lib/kiosk/cart-line';
import type { CounterTransactionResult } from '@/lib/counter/counter-transaction-types';
import { KIOSK_META, KIOSK_TILE_TITLE } from '@/app/kiosk/kiosk-chrome';
import { KIOSK_POS_CTA } from '@/app/kiosk/kiosk-pos-surface';
import { MOBILE_SCAN_ROW_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { safeRandomUUID } from '@/lib/safe-uuid';

interface KioskRepairPaneProps {
  /**
   * The picker's current selection — read for the step-0 reason vocabulary
   * (`sourceSku`) and as the template for `+ Add another device`. It is NOT
   * the device list: that is the cart's.
   */
  selectedProduct: ProductSelection | null;
  /**
   * Exit the step flow back to the repair catalog — the X in the pane's step
   * band. REQUIRED: the flow has no other way out, and the optional form is
   * what left a dead titled-band branch behind.
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

/**
 * The VISIT facts a fresh mount inherits from the cart.
 *
 * This pane unmounts every time the staffer goes back to the catalog — the
 * stage renders only in `checkout` — so a reason chosen or a signature taken
 * before that exit has to come back from the SESSION ROOT, not from a local
 * draft that died with the component. They are visit-level, so the first
 * repair line answers for all of them: the mirror effect writes the same facts
 * onto every line.
 */
function visitFactsFromLines(lines: readonly KioskCartLine[]): Partial<RepairFormData> {
  for (const line of lines) {
    if (line.type !== 'REPAIR' || !isRepairPayload(line.payload)) continue;
    return {
      repairReasons: line.payload.repairReasons ?? [],
      repairNotes: line.payload.repairNotes ?? '',
    };
  }
  return {};
}

/** The ink already on the visit, if the customer signed before a re-entry. */
function signatureFromLines(lines: readonly KioskCartLine[]): SignatureData | null {
  for (const line of lines) {
    if (line.type !== 'REPAIR' || !isRepairPayload(line.payload)) continue;
    if (!line.payload.signatureDataUrl) return null;
    return {
      dataUrl: line.payload.signatureDataUrl,
      strokes: line.payload.signatureStrokes,
    } as SignatureData;
  }
  return null;
}

/**
 * ONE device on the visit: its own title, its own SKU, its own serial, quote
 * and notes.
 *
 * ## Why the ids are shaped this way
 *
 * A DOM element carries exactly one `data-testid`, so "indexed AND legacy" is
 * not a thing one input can be. The FIRST device keeps the unsuffixed
 * `kiosk-repair-serial` / `kiosk-repair-price` / `kiosk-repair-notes` — a
 * single-device visit is the overwhelming case and its selectors are the ones
 * every existing assertion holds — and each further device is addressed by its
 * index. `idScope` keeps the `<label for>` pointing at THIS device's input;
 * without it every copy after the first would share the first's DOM id and a
 * screen reader would announce the wrong device.
 */
function KioskRepairDeviceCard({
  device,
  index,
  removable,
  onRemove,
  onSerialChange,
  onPriceChange,
  onNotesChange,
}: {
  device: KioskRepairDevice;
  index: number;
  /**
   * Remove is offered only on a multi-device visit: with one device on the
   * counter the trash verb would empty the visit the staffer is mid-way
   * through, and the picker behind the step band's X is the way to change what
   * is being repaired.
   */
  removable: boolean;
  onRemove: () => void;
  onSerialChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onNotesChange: (value: string) => void;
}) {
  const suffix = index === 0 ? '' : `-${index}`;
  return (
    <div
      className={cn(
        'flex flex-col gap-3 border border-border-hairline bg-surface-card px-4 py-3',
        MOBILE_SCAN_ROW_CORNER,
      )}
      data-testid="kiosk-repair-device"
      data-device-index={index}
      data-line-id={device.lineId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={KIOSK_TILE_TITLE}>{device.title}</p>
          {device.sku ? <p className={cn('mt-0.5', KIOSK_META)}>{device.sku}</p> : null}
        </div>
        {removable ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="h-4 w-4" />}
            ariaLabel={`Remove ${device.title} from this visit`}
            onClick={onRemove}
            data-testid={`kiosk-repair-device-remove${suffix}`}
          >
            Remove this device
          </Button>
        ) : null}
      </div>

      <KioskEntryField
        name="Serial number"
        idScope={device.lineId}
        value={device.serialNumber}
        testId={`kiosk-repair-serial${suffix}`}
        onChange={onSerialChange}
      />
      <KioskEntryField
        name="Price"
        idScope={device.lineId}
        value={device.price}
        inputMode="decimal"
        icon={<Receipt className="h-4 w-4" />}
        testId={`kiosk-repair-price${suffix}`}
        onChange={onPriceChange}
      />
      <KioskEntryField
        name="Notes (optional)"
        idScope={device.lineId}
        value={device.notes ?? ''}
        multiline
        testId={`kiosk-repair-notes${suffix}`}
        onChange={onNotesChange}
      />
    </div>
  );
}

export function KioskRepairPane({ selectedProduct, onBack }: KioskRepairPaneProps) {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  /*
   * Seeded from the cart, LAZILY — on mount, in one shot. An effect would
   * hydrate a render too late, and the mirror effect below would spend that
   * render writing this pane's empty reasons over the ones the cart is holding.
   */
  const [formData, setFormData] = useState<RepairFormData>(() =>
    buildInitialFormData(visitFactsFromLines(session.lines)),
  );
  const [signatureData, setSignatureData] = useState<SignatureData | null>(() =>
    signatureFromLines(session.lines),
  );
  const [transaction, setTransaction] = useState<CounterTransactionResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /**
   * The submit's dedupe key, minted once and KEPT. The counter dedupes on it
   * (`clientEventId`), so a fresh key on the second press of a timed-out
   * submit is how one visit gets recorded twice.
   */
  const submissionKey = useRef<string | null>(null);
  /** SKU the step-0 reason vocabulary is scoped to (null for an "Other" pick). */
  const sourceSku = selectedProduct?.sourceSku?.trim() || null;

  /**
   * THE DEVICES on this visit, derived from the cart and nothing else.
   *
   * This replaced a local `existingRepair` hydration that opened ONE line —
   * matched by product model, falling back to `repairs[0]` before 2026-08-21 —
   * and mirrored its serial, price and notes into `formData`. Two problems the
   * derivation retires outright: a second device's facts were unreachable
   * (there was one serial field for the lot), and the mirror was a second copy
   * of a fact the cart already owned, so the paperwork and the ticket could
   * disagree about what was being repaired.
   *
   * `formData.serialNumber` / `formData.price` are consequently NOT the
   * kiosk's source of truth any more. They stay on `RepairFormData` because
   * the staff single-intake form still writes them, and the gates take the
   * device list instead (`repair-intake-logic.ts`).
   */
  const devices = useMemo(() => repairDevicesFromLines(session.lines), [session.lines]);
  const hasDevices = devices.length > 0;

  /*
   * Contact fields are VISIT facts: they live on the session root, which is
   * what the cart, the triage panel and the submit all read. `formData.customer`
   * mirrors the three the repair gate checks.
   *
   * ADDRESS is deliberately not mirrored — `RepairFormData` has no address
   * field and must not grow one. Widening a LINE form with a visit-level fact
   * is how two sources of one truth start, and the cart already writes this
   * exact key. So it is read from and written to the session directly.
   */
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      customer: {
        name: session.customerName || prev.customer.name,
        phone: session.customerPhone || prev.customer.phone,
        email: session.customerEmail || prev.customer.email,
      },
    }));
  }, [session.customerName, session.customerPhone, session.customerEmail]);

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

  /** Merge a patch onto ONE device's nested payload. */
  const patchDevice = useCallback(
    (lineId: string, patch: Partial<RepairPayload>) => {
      const line = session.lines.find((l) => l.id === lineId);
      if (!line || !isRepairPayload(line.payload)) return;
      actions.updateLine(lineId, { payload: { ...line.payload, ...patch } });
    },
    [actions, session.lines],
  );

  /**
   * A device's QUOTE — the text on the paperwork and the money on the line, in
   * ONE write.
   *
   * Mirrors `KioskCartLineEditor`: `repair_service.price` is a text column the
   * agreement prints, and `unitAmountCents` is what the cart total and the
   * counter header are built from. Moving one without the other is how the
   * paperwork comes to disagree with the total.
   *
   * The quote step IS where a repair is priced, so a quote typed here replaces
   * any counter-authorized price on the line (a keypad amount, an editor
   * re-quote): that approval named the old figure, and submit refuses an
   * approval that no longer matches its line.
   */
  const setDevicePrice = useCallback(
    (lineId: string, value: string) => {
      const line = session.lines.find((l) => l.id === lineId);
      if (!line || !isRepairPayload(line.payload)) return;
      actions.updateLine(lineId, {
        unitAmountCents: repairPriceToCents(value),
        payload: { ...line.payload, price: value, priceAdjustment: null },
      });
    },
    [actions, session.lines],
  );

  /**
   * A second unit of the same product — three identical radios are three
   * serials, three rows and three quotes, and the picker cannot express that
   * (one tile, one selection).
   *
   * Copies the LAST device's product identity and quote (same model, same
   * price) and nothing else: a serial belongs to exactly one chassis.
   */
  const addAnotherDevice = useCallback(() => {
    const last = devices[devices.length - 1];
    const line = last ? session.lines.find((l) => l.id === last.lineId) : undefined;
    const template = line && isRepairPayload(line.payload) ? line.payload : null;
    const model = template?.productModel || selectedProduct?.model?.trim() || '';
    if (!model) return;
    actions.addRepair({
      title: model,
      unitAmountCents: line?.unitAmountCents ?? 0,
      payload: {
        productType: template?.productType ?? selectedProduct?.type ?? null,
        productModel: model,
        sourceSku: template?.sourceSku ?? selectedProduct?.sourceSku ?? null,
        serialNumber: '',
        price: template?.price ?? '',
      },
    });
  }, [actions, devices, session.lines, selectedProduct]);

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
   * (`getRepairSubmitBlockReason` is the only copy deck for those, and with a
   * device list it names WHICH device is short), then the open ticket question
   * once the paperwork is signable — which is exactly when the control that
   * answers it appears under the signature.
   */
  const blockReason =
    getRepairSubmitBlockReason(formData, !!signatureData, devices) ??
    (ticketSettled ? undefined : 'Pick the existing ticket to attach this repair to');
  const canSave = canSubmitRepairIntake(formData, !!signatureData, devices) && ticketSettled;

  // to a step-by-step mobile path native — continue after the issue, continue
  // after the information, continue after the authorization signature." Each
  // step ends in the same floating-free key the catalog uses; nothing scrolls
  // except the step's own content. STEP_HEADERS is the operator-facing copy
  // (module scope, above) — "Issue" never appears on screen; the step asks
  // its question in plain words instead.
  const steps = STEP_HEADERS;
  const [step, setStep] = useState(0);
  const lastStep = steps.length - 1;

  // ONE gate table for both consumers: the per-step Continue key and the
  // header's completed count (PG6 — a count of satisfied units, never the
  // index in view). Back-editing an earlier step un-fills its segment. The
  // DEVICE unit reads the cart's devices, so a four-device visit cannot
  // advance on device one's serial.
  const stepGates = repairStepGates(formData, !!signatureData, ticketSettled, devices);
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
   * ONE paperwork sheet PER DEVICE, all carrying the one signature.
   *
   * The VISIT facts are shared by construction (`repairReceiptPropsForDevice`
   * overrides only title, serial and price), so a two-device drop-off is two
   * agreements for the same customer, same issue and same date — which is what
   * the counter prints, because it is what `repair_service` stores. A
   * single-device visit is byte-identical to the one sheet this step showed
   * before.
   */
  const paperworkSheets = useMemo(
    () =>
      devices.map((device) => ({
        lineId: device.lineId,
        props: repairReceiptPropsForDevice(
          formData,
          device,
          formData.repairReasons.join(', ') || formData.repairNotes,
          '',
          paperworkTicketId ?? '',
        ),
      })),
    [devices, formData, paperworkTicketId],
  );

  /**
   * The VISIT's facts, as they stand right now.
   *
   * ONE derivation, two appliers: the mirror effect below keeps every repair
   * line carrying them while the customer is still filling the form, and
   * {@link submitVisit} stamps them once more onto the array it posts so the
   * write cannot depend on effect timing.
   */
  const visitFacts = useMemo(
    () => ({
      repairReasons: formData.repairReasons,
      repairNotes: formData.repairNotes || null,
      signatureDataUrl: signatureData?.dataUrl ?? null,
      signatureStrokes: signatureData?.strokes ?? null,
    }),
    [formData.repairReasons, formData.repairNotes, signatureData],
  );

  /**
   * Mirror the visit facts onto EVERY repair line as they are captured.
   *
   * Not only at submit, for two reasons. `/api/kiosk/intake` demands "Repair
   * Reason or Notes" per device (`missingRepairIntakeFields`), and a drop-off
   * that ALSO has a case on the counter is committed from the CART rather than
   * from this pane — so a pane that stamped the reasons on its own submit only
   * left the cart holding lines the counter would refuse. And a signature
   * captured here and then left behind by the step band's X was simply gone;
   * the cart is the session root precisely so it does not have to be.
   *
   * Writes only what actually changed: `updateLine` produces a new
   * `session.lines`, so an unconditional write would re-enter this effect
   * forever.
   */
  useEffect(() => {
    for (const line of session.lines) {
      if (line.type !== 'REPAIR' || !isRepairPayload(line.payload)) continue;
      const payload = line.payload;
      const reasons = payload.repairReasons ?? [];
      const settled =
        reasons.length === visitFacts.repairReasons.length &&
        reasons.every((reason, i) => reason === visitFacts.repairReasons[i]) &&
        (payload.repairNotes ?? null) === visitFacts.repairNotes &&
        (payload.signatureDataUrl ?? null) === visitFacts.signatureDataUrl;
      if (settled) continue;
      actions.updateLine(line.id, { payload: { ...payload, ...visitFacts } });
    }
  }, [session.lines, visitFacts, actions]);

  /**
   * Submit the VISIT.
   *
   * The visit facts — reasons, notes, signature — are stamped onto EVERY
   * repair line here as well as by the mirror effect above, because
   * `cart-to-counter.ts` reads them off each payload to build that device's
   * `repair_service` row. A signature captured once but stamped on only the
   * line the pane happened to be editing is how a second device reached the
   * counter unauthorised.
   *
   * The lines handed to the submit are that PATCHED array, not a re-read of
   * the store: `actions.updateLine` does not mutate this render's
   * `session.lines`, so reading it back here would post the pre-patch
   * payloads — which is exactly the bug the belt-and-braces stamp closes when
   * the last keystroke and the commit press land in one commit.
   */
  const submitVisit = async () => {
    if (!canSave || submitting || transaction) return;
    setSubmitting(true);
    setSubmitError(null);
    submissionKey.current ??= safeRandomUUID();

    const lines: KioskCartLine[] = session.lines.map((line) =>
      line.type === 'REPAIR' && isRepairPayload(line.payload)
        ? { ...line, payload: { ...line.payload, ...visitFacts } }
        : line,
    );
    for (const line of lines) {
      if (line.type !== 'REPAIR') continue;
      actions.updateLine(line.id, { payload: line.payload });
    }

    const customer = {
      phone: formData.customer.phone,
      name: formData.customer.name,
      email: formData.customer.email,
    };
    actions.setCustomer(customer);

    try {
      const tx = await submitKioskVisit(
        {
          lines,
          customerPhone: customer.phone,
          customerName: customer.name,
          customerEmail: customer.email,
          customerAddress: session.customerAddress ?? '',
          ticketChoice: session.ticketChoice,
        },
        { idempotencyKey: submissionKey.current, takePayment: false },
      );
      setTransaction(tx);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Could not submit this repair. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  /*
   * THE one success page. The pane's own hero — an `rsNumber`, the signed
   * agreement and a Next customer key — is gone: it was a SECOND terminal
   * document for a visit that already had one, and it could only state the
   * facts of the single row the retired endpoint wrote. `KioskCartDoneFace`
   * states the whole transaction (every service checked in, the receipts) and
   * is what the cart's own submit lands on, so both keys now end in the same
   * place. The wrapper keeps `kiosk-repair-success` as the anchor.
   */
  if (transaction) {
    return (
      <div
        className="flex min-h-0 w-full flex-1 flex-col"
        data-testid="kiosk-repair-success"
      >
        <KioskCartDoneFace
          result={transaction}
          onClose={onBack}
          onNextCustomer={() => {
            actions.resetSession();
            onBack();
          }}
        />
      </div>
    );
  }

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
        hasDevices ? undefined : (
          <div className="text-center">
            <h3 className="text-lg font-semibold text-text-default">No device selected</h3>
            <p className="mt-2 text-text-soft">
              Select a repair service from the catalog to begin intake.
            </p>
          </div>
        )
      }
      footer={
        hasDevices ? (
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
                device without losing the first, which the step-1 repeater and
                its `+ Add another device` key now do properly.

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

                MECHANICALLY it submits the whole VISIT through
                `submitKioskVisit` — the counter header, one `repair_service`
                row per device, the ticket outbox work. The label is the
                operator's word for the counter's job.
              */
              <Button
                variant="warning"
                size="lg"
                className={KIOSK_POS_CTA}
                disabled={!canSave}
                onClick={() => void submitVisit()}
                title={blockReason ?? undefined}
                data-testid="kiosk-repair-submit"
              >
                {submitting ? 'Submitting…' : 'Submit repair'}
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
              </div>
            )}

            {/*
              DEVICE — what is on the counter and what each unit costs. The
              staffer's half of the form: the serial comes off the chassis, the
              price is the quote. The price field wears the house money mark
              (`Receipt` — the documented price glyph) in success green, so the
              field states its kind before anyone reads the placeholder
              (operator 2026-09-15: "a green price icon").

              ONE CARD PER DEVICE (2026-09-16). It was one serial field, one
              price field and one notes box for the whole visit, with the
              picker's `', '`-joined product list standing in for the device —
              so a customer who put two radios on the counter was recorded as
              one device with a 180-character title, one serial and a summed
              quote, and the serial that was written belonged to neither unit.
              Every edit here goes straight to that device's CART LINE, which
              is the row that will be written.
            */}
            {step === 1 && (
              <div className="flex flex-col gap-3 bg-surface-card px-4 pb-4">
                {devices.map((device, index) => (
                  <KioskRepairDeviceCard
                    key={device.lineId}
                    device={device}
                    index={index}
                    removable={devices.length > 1}
                    onRemove={() => actions.removeLine(device.lineId)}
                    onSerialChange={(value) =>
                      patchDevice(device.lineId, { serialNumber: value })
                    }
                    onPriceChange={(value) => setDevicePrice(device.lineId, value)}
                    onNotesChange={(value) =>
                      patchDevice(device.lineId, { notes: value || null })
                    }
                  />
                ))}

                <Button
                  variant="ghost"
                  size="lg"
                  className="w-full"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={addAnotherDevice}
                  data-testid="kiosk-repair-add-device"
                >
                  Add another device
                </Button>

                {/* The visit's quote, once there is more than one unit to sum.
                    Below one device it would restate the field directly above
                    it. Reads `repairDevicesTotalCents` — the same integers the
                    cart totals and the counter header are built from, not a
                    second parse of the typed quotes. */}
                {devices.length > 1 ? (
                  <div className="flex items-baseline justify-between gap-3 border-t border-border-hairline pt-3">
                    <span className={KIOSK_META}>
                      Total · {devices.length} devices
                    </span>
                    <span
                      className="text-lg font-semibold tabular-nums text-text-default"
                      data-testid="kiosk-repair-device-total"
                    >
                      {formatCartCents(repairDevicesTotalCents(devices))}
                    </span>
                  </div>
                ) : null}
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
                onSubmit={() => {
                  if (stepCanContinue) setStep((s) => Math.min(lastStep, s + 1));
                }}
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

                  ONE SHEET PER DEVICE, stacked, all authorised by the single
                  signature below — because the counter writes one
                  `repair_service` row, and prints one agreement, per unit.
                */}
                {paperworkSheets.map((sheet) => (
                  <RepairPaperworkCanvas key={sheet.lineId} align="full" frame="bordered">
                    <RepairServiceForm
                      surface="screen"
                      density="compact"
                      sections="full"
                      dropoffSignatureUrl={signatureData?.dataUrl ?? null}
                      {...sheet.props}
                    />
                  </RepairPaperworkCanvas>
                ))}
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

                {submitError ? (
                  <p className="text-center text-sm font-semibold text-text-danger" role="alert">
                    {submitError}
                  </p>
                ) : null}

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
