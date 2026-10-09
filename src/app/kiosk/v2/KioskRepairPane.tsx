'use client';

/** Landscape repair details — the VISIT's paperwork, and the key that submits it. */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/design-system/primitives';
import { Plus, Receipt } from '@/components/Icons';
import { KioskPaneForm } from '@/components/kiosk/KioskPaneForm';
import { KioskReasonStep } from '@/components/repair/KioskReasonStep';
import { KioskTicketStep } from '@/components/kiosk/KioskTicketStep';
import { KioskCustomerIntake } from '@/components/kiosk/KioskCustomerIntake';
import { KioskEntryField } from '@/components/kiosk/KioskEntryField';
import { KioskSerialListField } from '@/components/kiosk/KioskSerialListField';
import { RepairPaperworkCanvas } from '@/components/repair/RepairPaperworkCanvas';
import RepairServiceForm from '@/components/repair/RepairServiceForm';
import { KioskCartDoneFace } from './KioskCartDoneFace';
import { repairPaperworkSheets, repairVisitFactsFromLines } from '@/lib/kiosk/repair-paperwork-sheets';
import { decodeShipToAddress, formatShipToOneLine } from '@/lib/customers/ship-to-address';
import { SignaturePad, type SignatureData } from '@/components/ui/SignaturePad';
import type { RepairFormData } from '@/components/repair/RepairIntakeForm';
import {
  buildInitialFormData,
  canSubmitRepairIntake,
  getRepairSubmitBlockReason,
  repairStepBlockReason,
  repairStepGates,
} from '@/components/repair/repair-intake-logic';
import {
  useKioskSession,
  useKioskSessionActions,
} from '@/lib/kiosk/kiosk-session-store';
import { repairQuotePatch } from '@/lib/kiosk/repair-line-payload';
import {
  repairDeviceGroups,
  repairDevicesFromLines,
  repairDevicesTotalCents,
  repairUnitToDrop,
  sharedRepairReasons,
  type KioskRepairDeviceGroup,
} from '@/lib/kiosk/repair-devices';
import { stepCartQuantity } from '@/lib/kiosk/cart-card-view';
import { KioskQuantityStepper, KioskRemoveConfirm } from '@/components/kiosk/KioskQuantityStepper';
import { submitKioskVisit } from '@/lib/kiosk/submit-kiosk-visit';
import { KioskStepTitleRow } from '@/components/kiosk/KioskStepTitleRow';
import { KioskCompanionPanel } from '@/components/kiosk/KioskCompanionPanel';
import { useKioskCompanionLink } from '@/components/kiosk/useKioskCompanionLink';
import { isKioskTicketChoiceSettled } from '@/lib/kiosk/repair-ticket-choice';
import { paperworkTicketNumber, useNextTicketPreview } from '@/lib/kiosk/use-next-ticket-preview';
import { isRepairPayload, type KioskCartLine, type RepairPayload } from '@/lib/kiosk/cart-line';
import type { CounterTransactionResult } from '@/lib/counter/counter-transaction-types';
import { KIOSK_META, KIOSK_TILE_TITLE } from '@/app/kiosk/kiosk-chrome';
import { KIOSK_POS_CTA } from '@/app/kiosk/kiosk-pos-surface';
import { MOBILE_SCAN_ROW_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { safeRandomUUID } from '@/lib/safe-uuid';

/**
 * The four step headers, in order — each the step's own question in plain
 * words. Operator 2026-09-14: no "Issue" eyebrow, no duplicate label inside
 */
const STEP_HEADERS = [
  'Reason for repair',
  'Device & quote',
  'Contact information',
  'Review & sign',
] as const;

/** The VISIT facts a fresh mount inherits from the cart. */
function visitFactsFromLines(lines: readonly KioskCartLine[]): Partial<RepairFormData> {
  return { repairNotes: repairVisitFactsFromLines(lines).notes };
}

/** The ink already on the visit, if the customer signed before a re-entry. */
function signatureFromLines(lines: readonly KioskCartLine[]): SignatureData | null {
  const { signatureDataUrl, signatureStrokes } = repairVisitFactsFromLines(lines);
  if (!signatureDataUrl) return null;
  return { dataUrl: signatureDataUrl, strokes: signatureStrokes } as SignatureData;
}

/**
 * ONE product on the visit and every unit of it:
 * `−` at 1 swaps in the cart's `Remove this item?` row (operator 2026-09-24:
 */
function KioskRepairDeviceCard({
  group,
  groupIndex,
  unitIndexOf,
  onAddUnit,
  onDropUnit,
  onSerialChange,
  onPriceChange,
  onNotesChange,
}: {
  group: KioskRepairDeviceGroup;
  groupIndex: number;
  /** A unit's index among ALL devices on the visit (for its test id). */
  unitIndexOf: (lineId: string) => number;
  onAddUnit: () => void;
  onDropUnit: (lineId: string) => void;
  onSerialChange: (lineId: string, value: string) => void;
  onPriceChange: (value: string) => void;
  onNotesChange: (value: string) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const first = group.units[0]!;
  const count = group.units.length;
  const cardSuffix = groupIndex === 0 ? '' : `-${groupIndex}`;

  const step = (delta: 1 | -1) => {
    const next = stepCartQuantity(count, delta);
    if (next.kind === 'confirm-remove') {
      setConfirmRemove(true);
      return;
    }
    if (delta === 1) onAddUnit();
    else {
      const unit = repairUnitToDrop(group.units);
      if (unit) onDropUnit(unit.lineId);
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border border-border-hairline bg-surface-card px-4 py-3',
        MOBILE_SCAN_ROW_CORNER,
      )}
      data-testid="kiosk-repair-device"
      data-device-index={groupIndex}
      data-line-id={first.lineId}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={KIOSK_TILE_TITLE}>{group.title}</p>
          {group.sku ? <p className={cn('mt-0.5', KIOSK_META)}>{group.sku}</p> : null}
        </div>
        {confirmRemove ? null : (
          <KioskQuantityStepper
            title={group.title}
            quantity={count}
            onStep={step}
            canRemove
            testIdPrefix={`kiosk-repair-device${cardSuffix}`}
          />
        )}
      </div>
      {confirmRemove ? (
        <KioskRemoveConfirm
          testIdPrefix={`kiosk-repair-device${cardSuffix}`}
          onKeep={() => setConfirmRemove(false)}
          onRemove={() => {
            setConfirmRemove(false);
            onDropUnit(first.lineId);
          }}
        />
      ) : null}

      {group.units.map((unit, i) => {
        const index = unitIndexOf(unit.lineId);
        return (
          <KioskSerialListField
            key={unit.lineId}
            name={count > 1 ? `Serial number ${i + 1}` : 'Serial number'}
            idScope={unit.lineId}
            value={unit.serialNumber}
            testId={`kiosk-repair-serial${index === 0 ? '' : `-${index}`}`}
            onChange={(value) => onSerialChange(unit.lineId, value)}
          />
        );
      })}
      <KioskEntryField
        name={count > 1 ? 'Price (each)' : 'Price'}
        idScope={first.lineId}
        value={first.price}
        inputMode="decimal"
        icon={<Receipt className="h-4 w-4" />}
        testId={`kiosk-repair-price${cardSuffix}`}
        onChange={onPriceChange}
      />
      <KioskEntryField
        name="Notes (optional)"
        idScope={first.lineId}
        value={first.notes ?? ''}
        multiline
        testId={`kiosk-repair-notes${cardSuffix}`}
        onChange={onNotesChange}
      />
    </div>
  );
}

export function KioskRepairPane({ onBack }: { onBack: () => void }) {
  const session = useKioskSession();
  const actions = useKioskSessionActions();
  /*
   * Seeded from the cart, LAZILY — on mount, in one shot. An effect would
   * hydrate a render too late, and the mirror effect below would spend that
   * render writing this pane's empty notes over the ones the cart is holding.
   */
  const [formData, setFormData] = useState<RepairFormData>(() =>
    buildInitialFormData({
      ...visitFactsFromLines(session.lines),
      // The mirror effect below keeps these in step; seeding them here too is
      // what lets the resume step (below) see a phone already on the visit.
      customer: {
        name: session.customerName,
        phone: session.customerPhone,
        email: session.customerEmail,
      },
    }),
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

  /** THE DEVICES on this visit, derived from the cart and nothing else. */
  const devices = useMemo(() => repairDevicesFromLines(session.lines), [session.lines]);
  const deviceGroups = useMemo(() => repairDeviceGroups(devices), [devices]);
  const hasDevices = devices.length > 0;

  /* Contact fields are VISIT facts: */
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      customer: {
        name: session.customerName,
        phone: session.customerPhone,
        email: session.customerEmail,
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

  /*
   * The phone companion: a signed-in staff phone scans this QR, sees these
   * units, and every serial it scans lands here through the same line write
   * the serial field makes (operator 2026-09-24).
   */
  const companionDevices = useMemo(
    () =>
      devices.map((d) => ({
        lineId: d.lineId,
        title: d.title,
        sku: d.sku,
        serialNumber: d.serialNumber,
      })),
    [devices],
  );
  const companion = useKioskCompanionLink({
    devices: companionDevices,
    onSerial: ({ lineId, serialNumber }) => patchDevice(lineId, { serialNumber }),
  });

  /**
   * A device's QUOTE — one write through `repairQuotePatch`, the same rule the
   * cart's line editor uses, so a quote typed in either place is one fact.
   */
  const setDevicePrice = useCallback(
    (lineId: string, value: string) => {
      const line = session.lines.find((l) => l.id === lineId);
      if (!line || !isRepairPayload(line.payload)) return;
      actions.updateLine(lineId, repairQuotePatch(line.payload, value));
    },
    [actions, session.lines],
  );

  /*
   * `+ Add another device` has no handler of its own:
   * picked from the catalog exactly like the first (operator 2026-09-24: "add
   */

  /** One more unit of a product on the visit — a new line with the product's identity and quote, and an empty serial (a serial belongs to… */
  const addUnit = useCallback(
    (group: KioskRepairDeviceGroup) => {
      const template = session.lines.find((l) => l.id === group.units[0]!.lineId);
      if (!template || !isRepairPayload(template.payload)) return;
      const { productType, productModel, sourceSku, price, notes, custom } = template.payload;
      actions.addRepair({
        title: template.title,
        unitAmountCents: template.unitAmountCents,
        payload: {
          productType,
          productModel,
          sourceSku,
          price,
          notes,
          custom,
          serialNumber: '',
          repairReasons: sharedRepairReasons(devices) ?? [],
        },
      });
    },
    [actions, devices, session.lines],
  );

  /**
   * Write a reasons set onto exactly these repair lines — the ONE reasons
   * writer. All devices hands every unit's id; Per device hands one.
   */
  const setUnitReasons = useCallback(
    (lineIds: readonly string[], repairReasons: string[]) => {
      for (const lineId of lineIds) patchDevice(lineId, { repairReasons });
    },
    [patchDevice],
  );

  /*
   * `ticketChoice` is a VISIT fact on the session root, not a line fact — one `ticketWork` per submit however many devices this customer…
   * control is a real answer (operator 2026-09-15: *"automatically select
   */
  const ticketSettled = isKioskTicketChoiceSettled(session.ticketChoice);
  /* ONE refusal sentence for this pane: */
  const blockReason =
    getRepairSubmitBlockReason(formData, !!signatureData, devices) ??
    (ticketSettled ? undefined : 'Pick the existing ticket to attach this repair to');
  const canSave = canSubmitRepairIntake(formData, !!signatureData, devices) && ticketSettled;

  // to a step-by-step mobile path native — continue after the issue, continue after the information, continue after the authorization…
  const steps = STEP_HEADERS;
  const lastStep = steps.length - 1;
  // ONE gate table for both consumers:
  const stepGates = repairStepGates(formData, !!signatureData, ticketSettled, devices);
  /* RESUME at the first unsatisfied step. */
  const [step, setStep] = useState(() => {
    const open = stepGates.findIndex((satisfied) => !satisfied);
    return open === -1 ? lastStep : open;
  });
  const stepCanContinue = stepGates[step] ?? canSave;
  // Why Continue is grey, in words on the floor. The review step prints its
  // own refusal in the body under the signature, so the floor stays quiet
  // there — one sentence per screen, never the same one twice.
  const continueReason =
    hasDevices && step < lastStep
      ? repairStepBlockReason(
          step as 0 | 1 | 2,
          formData,
          !!signatureData,
          ticketSettled,
          devices,
        )
      : null;
  const completedSteps = stepGates.filter(Boolean).length;

  /*
   * The support ticket the paperwork previews. Fetched only once the customer
   * is actually looking at the sheet — a tablet parked on step 0 has no reason
   * to ask the helpdesk anything.
   */
  const nextTicketId = useNextTicketPreview(step === lastStep);

  /** The number the paperwork states — see {@link paperworkTicketNumber}. */
  const paperworkTicketId = paperworkTicketNumber(session.ticketChoice, nextTicketId);

  /** ONE paperwork sheet PER DEVICE, all carrying the one signature — built by `repairPaperworkSheets`, the same builder the top-chrome… */
  const paperworkSheets = useMemo(
    () =>
      repairPaperworkSheets({
        customer: formData.customer,
        visitNotes: formData.repairNotes,
        devices,
        ticketNumber: paperworkTicketId ?? '',
        shipTo: formatShipToOneLine(decodeShipToAddress(session.customerAddress)),
      }),
    [devices, formData.customer, formData.repairNotes, paperworkTicketId, session.customerAddress],
  );

  /** The VISIT's facts, as they stand right now. */
  const visitFacts = useMemo(
    () => ({
      repairNotes: formData.repairNotes || null,
      signatureDataUrl: signatureData?.dataUrl ?? null,
      signatureStrokes: signatureData?.strokes ?? null,
    }),
    [formData.repairNotes, signatureData],
  );

  /** Mirror the visit facts onto EVERY repair line as they are captured. */
  useEffect(() => {
    for (const line of session.lines) {
      if (line.type !== 'REPAIR' || !isRepairPayload(line.payload)) continue;
      const payload = line.payload;
      const settled =
        (payload.repairNotes ?? null) === visitFacts.repairNotes &&
        (payload.signatureDataUrl ?? null) === visitFacts.signatureDataUrl;
      if (settled) continue;
      actions.updateLine(line.id, { payload: { ...payload, ...visitFacts } });
    }
  }, [session.lines, visitFacts, actions]);

  /** Submit the VISIT. */
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
      actions.completeCart();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Could not submit this repair. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  /* THE one success page. */
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
      footerNote={continueReason}
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
               * ONE key on the review floor.
               * "Add") is GONE — operator 2026-09-15: *"remove the add bottom
               * ORANGE, and named for the job: operator 2026-09-15 — *"save to
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
                groups={deviceGroups}
                notes={formData.repairNotes}
                onReasonsChange={setUnitReasons}
                onNotesChange={(notes) =>
                  setFormData((prev) => ({ ...prev, repairNotes: notes }))
                }
              />
            ) : (
              /*
               * Steps 1-3 wear the cart's header row exactly — title left,
               * `N · $total` right (operator 2026-09-24: "Device & quote …
               */
              <KioskStepTitleRow
                title={STEP_HEADERS[step]}
                count={devices.length}
                totalCents={repairDevicesTotalCents(devices)}
                testId="kiosk-repair-summary"
              />
            )}

            {/*
 * DEVICE — what is on the counter and what each unit costs.
 * (operator 2026-09-15: "a green price icon").
 */}
            {step === 1 && (
              <div className="flex flex-col gap-3 bg-surface-card px-4 pb-4">
                <KioskCompanionPanel
                  link={companion.link}
                  opening={companion.opening}
                  onOpen={() => void companion.open()}
                />
                {deviceGroups.map((group, groupIndex) => (
                  <KioskRepairDeviceCard
                    // The FIRST unit's line, not the group key: a keypad
                    // device's key is its price, and typing a quote must not
                    // remount the card under the staffer's cursor.
                    key={group.units[0]!.lineId}
                    group={group}
                    groupIndex={groupIndex}
                    onAddUnit={() => addUnit(group)}
                    unitIndexOf={(lineId) => devices.findIndex((d) => d.lineId === lineId)}
                    onDropUnit={(lineId) => actions.removeLine(lineId)}
                    onSerialChange={(lineId, value) =>
                      patchDevice(lineId, { serialNumber: value })
                    }
                    onPriceChange={(value) => {
                      for (const unit of group.units) setDevicePrice(unit.lineId, value);
                    }}
                    onNotesChange={(value) => {
                      for (const unit of group.units) patchDevice(unit.lineId, { notes: value || null });
                    }}
                  />
                ))}

                <Button
                  variant="ghost"
                  size="lg"
                  className="w-full"
                  icon={<Plus className="h-4 w-4" />}
                  onClick={onBack}
                  data-testid="kiosk-repair-add-device"
                >
                  Add another device
                </Button>
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
 * THE PAPERWORK, not a summary of it.
 * Operator 2026-09-15: *"it should just display the paperwork
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
                {/* Outside the sheet on purpose: */}
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
 * THE TICKET QUESTION — under the signature, inside this step.
 * It was briefly a FIFTH step. Operator 2026-09-15: *"because
 */}
                {signatureData ? (
                  <KioskTicketStep
                    choice={session.ticketChoice}
                    onChoose={actions.setTicketChoice}
                  />
                ) : null}

                {/* ONE refusal sentence on this floor: */}
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
