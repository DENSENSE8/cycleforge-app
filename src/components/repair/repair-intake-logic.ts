import { CONTACT_FIELDS, type ContactFieldKey } from './CustomerInfoForm';
import type { RepairIntakeStepKey } from './RepairIntakeStepper';
import type { RepairFormData } from './RepairIntakeForm';

/** Per-step header copy for the intake wizard. */
export const REPAIR_STEP_COPY: Record<RepairIntakeStepKey, { title: string; subtitle: string }> = {
  product: {
    title: 'Select repair service',
    subtitle: 'Choose the product or pick a common repair.',
  },
  issue: {
    title: 'Issue / reason for repair',
    subtitle: 'Describe what needs to be repaired.',
  },
  contact: {
    title: 'Contact information',
    subtitle: 'Enter customer details for the repair ticket.',
  },
  review: {
    title: 'Review & sign',
    subtitle: 'Confirm all details with the customer before submitting.',
  },
};

export function isProductSelected(data: RepairFormData): boolean {
  return !!(data.product.type && data.product.model.trim());
}

export function hasRepairIssue(data: RepairFormData): boolean {
  return data.repairReasons.length > 0 || data.repairNotes.trim().length > 0;
}

export function isContactComplete(data: RepairFormData): boolean {
  return CONTACT_FIELDS.every((field) => isContactFieldValid(field, data));
}

/**
 * The CONTACT half only — the customer's own details.
 *
 * `CONTACT_FIELDS` includes the legacy `extras` entry, whose validator is the
 * form's singular serial + price. That is a DEVICE fact, and on the kiosk it
 * lives per cart line rather than on the form, so asking it here would gate
 * the submit on two fields nothing writes any more — Submit repair disabled
 * forever with every device correctly filled in. With a device list the
 * device facts are asked by `deviceFactsSatisfied`, once, where they belong.
 */
function isContactCompleteFor(
  data: RepairFormData,
  devices?: readonly RepairDeviceGateRow[],
): boolean {
  if (!devices) return isContactComplete(data);
  return CONTACT_FIELDS.filter((field) => field !== 'extras').every((field) =>
    isContactFieldValid(field, data),
  );
}

/**
 * The DEVICE facts a gate needs, per unit on the counter.
 *
 * Structural on purpose — this module must not import the kiosk cart to ask
 * "is every device serialised". `src/lib/kiosk/repair-devices.ts` produces
 * rows that satisfy it; the staff form passes nothing and keeps its singular
 * fields. One rule, two callers, no fork.
 */
export interface RepairDeviceGateRow {
  title: string;
  serialNumber: string;
  price: string;
  /** This unit's own reasons — reasons are a LINE fact on the kiosk. */
  repairReasons: readonly string[];
}

/**
 * Is there an issue on the paperwork for every unit?
 *
 * Same rule `missingRepairIntakeFields` applies per `repair_service` row —
 * "Repair Reason or Notes" — asked of EVERY unit, because each unit carries
 * its own reasons (All devices stamps one set on every line; Per device writes
 * one line). Notes are a visit fact mirrored onto every line, so notes answer
 * for every unit at once. Without a device list (staff form) the form's own
 * reasons are the answer. Linked repairs never reach here:
 * `repairDevicesFromLines` drops them, and they were answered at their intake.
 */
function issueSatisfied(data: RepairFormData, devices?: readonly RepairDeviceGateRow[]): boolean {
  if (!devices) return hasRepairIssue(data);
  if (data.repairNotes.trim()) return true;
  return devices.length > 0 && devices.every((d) => d.repairReasons.length > 0);
}

/**
 * Is every device serialised and quoted?
 *
 * With a device list (kiosk, one row per unit) EVERY row must answer, because
 * every row becomes its own `repair_service` write. Without one (staff form,
 * one device per intake) the form's own singular fields are the answer. An
 * EMPTY list is not "nothing to check" — it is a visit with no device on it.
 */
function deviceFactsSatisfied(
  data: RepairFormData,
  devices?: readonly RepairDeviceGateRow[],
): boolean {
  if (devices) {
    return (
      devices.length > 0 &&
      devices.every((d) => d.serialNumber.trim().length > 0 && d.price.trim().length > 0)
    );
  }
  return !!data.serialNumber.trim() && !!data.price.trim();
}

/** Mirrors `/api/repair/submit` required fields + signature gate on the review step. */
export function canSubmitRepairIntake(
  data: RepairFormData,
  hasSignature: boolean,
  devices?: readonly RepairDeviceGateRow[],
): boolean {
  const productChosen = devices ? devices.length > 0 : isProductSelected(data);
  return (
    productChosen &&
    issueSatisfied(data, devices) &&
    isContactCompleteFor(data, devices) &&
    deviceFactsSatisfied(data, devices) &&
    hasSignature
  );
}

/** Tooltip copy when the review-step submit button is disabled. */
export function getRepairSubmitBlockReason(
  data: RepairFormData,
  hasSignature: boolean,
  devices?: readonly RepairDeviceGateRow[],
): string | undefined {
  if (devices) {
    if (devices.length === 0) return 'Add the device being dropped off';
  } else if (!isProductSelected(data)) {
    return 'Select a repair product to submit';
  }
  if (!issueSatisfied(data, devices)) {
    // Name the unit once there is more than one — same reason as the serial
    // refusal below.
    const short = devices && devices.length > 1 ? devices.find((d) => d.repairReasons.length === 0) : null;
    return short
      ? `${short.title} still needs a reason for repair`
      : 'Issue or repair notes required to submit';
  }
  if (!data.customer.name.trim()) return 'Customer name required to submit';
  if (!data.customer.phone.trim()) return 'Phone number required to submit';
  if (devices) {
    // Name the unit: "Serial number required" beside four device cards does
    // not say which card is short.
    const short = devices.find(
      (d) => !d.serialNumber.trim() || !d.price.trim(),
    );
    if (short) {
      const missing = [
        short.serialNumber.trim() ? null : 'serial number',
        short.price.trim() ? null : 'price',
      ]
        .filter(Boolean)
        .join(' and ');
      return devices.length > 1
        ? `${short.title} still needs its ${missing}`
        : `${missing.charAt(0).toUpperCase()}${missing.slice(1)} required to submit`;
    }
  } else {
    if (!data.serialNumber.trim()) return 'Serial number required to submit';
    if (!data.price.trim()) return 'Price required to submit';
  }
  if (!hasSignature) return 'Signature required to submit';
  return undefined;
}

/** Whether a single contact-step field is satisfied. Serial + price are required
 *  in the combined "extras" step; email is optional, notes ride along with extras. */
export function isContactFieldValid(field: ContactFieldKey, data: RepairFormData): boolean {
  switch (field) {
    case 'name':
      return !!data.customer.name.trim();
    case 'phone':
      return !!data.customer.phone.trim();
    case 'email':
      return true;
    case 'extras':
      return !!data.serialNumber.trim() && !!data.price.trim();
  }
}

/**
 * The kiosk pane's FOUR touch steps as satisfied/unsatisfied gates:
 * Reason · Device · Contact · Authorization.
 *
 * Feeds `StepProgressHeader` (PG6: progression is a COUNT of satisfied
 * required units, never the index of the step in view — a pointer parked on
 * the last step with nothing filled reads 0/4, not 4/4). Each gate is
 * evaluated independently so back-editing an earlier step un-fills its
 * segment.
 *
 * ## Why Device split out of Contact (2026-09-15)
 *
 * Serial and price rode along in the contact step as "extras", so one screen
 * asked both *who are you* and *what is the device worth*. Operator: *"there
 * should be contact information just as phone number name email address and
 * address with serial number and price under a different stepper."* They are
 * different subjects with different owners at the counter — the staffer reads
 * the serial off the chassis and quotes the price; the customer gives their
 * own details — so they are different units.
 *
 * DEVICE is serial + price. CONTACT is the phone (the match key); name, email
 * and address are warnings on the visit, never gates — same rule the cart's
 * triage applies, so the two flows cannot disagree about what blocks.
 *
 * ## Why the TICKET decision rides AUTHORIZATION (2026-09-15)
 *
 * The create-or-link question was briefly a fifth unit. Operator: *"because
 * the stepper is full at that review and sign step, would it be best to
 * include a slider … below the signature so it would be mounted under one
 * step?"* It is the same unit: authorizing the drop-off is signing the
 * paperwork AND saying which conversation it belongs to, both on the sheet's
 * own screen. One tap does not earn a progress segment of its own.
 *
 * `ticketSettled` (`isKioskTicketChoiceSettled`) is passed in rather than read
 * off `RepairFormData` because the decision is a VISIT fact on the session
 * root, not a line fact — `ticketWork` is transaction-level, one per submit
 * however many devices were dropped off. Widening the line form with it is the
 * same mistake the address avoided.
 *
 * SETTLED, not "answered": the slider opens on Create and an untouched control
 * files a new ticket, so an untouched visit is not blocked. What blocks is the
 * half-finished state — slid to Link with no ticket picked.
 *
 * ## Why DEVICE takes a list (2026-09-16)
 *
 * A customer can hand over several units, and each one becomes its own
 * `repair_service` row with its own serial and its own quote. The gate
 * therefore asks every device, not one pair of fields: the old single check
 * passed a four-device visit on the strength of device one's serial, and the
 * other three were written blank. `devices` omitted = the staff form's single
 * device, unchanged.
 *
 * ## Why REASON takes the list too (2026-09-25)
 *
 * Reasons became a LINE fact (operator: "all devices, or per device with a
 * switcher"), so the reason unit asks every device the same way: each needs
 * at least one reason unless the visit's notes answer for all of them.
 */
export function repairStepGates(
  data: RepairFormData,
  hasSignature: boolean,
  ticketSettled: boolean,
  devices?: readonly RepairDeviceGateRow[],
): readonly [boolean, boolean, boolean, boolean] {
  return [
    issueSatisfied(data, devices),
    deviceFactsSatisfied(data, devices),
    data.customer.phone.replace(/\D/g, '').length >= 7,
    canSubmitRepairIntake(data, hasSignature, devices) && ticketSettled,
  ] as const;
}

/** Seed the form state from optional initial data.
 *  Price starts empty — the catalog projection (or staff override) must supply it.
 *  An invented default like `130` is an audit smell and is intentionally gone. */
export function buildInitialFormData(initialData?: Partial<RepairFormData>): RepairFormData {
  return {
    product: {
      type: initialData?.product?.type || '',
      model: initialData?.product?.model || '',
      sourceSku: initialData?.product?.sourceSku ?? null,
    },
    repairReasons: Array.isArray(initialData?.repairReasons) ? initialData!.repairReasons : [],
    repairNotes: initialData?.repairNotes || '',
    customer: {
      name: initialData?.customer?.name || '',
      phone: initialData?.customer?.phone || '',
      email: initialData?.customer?.email || '',
    },
    serialNumber: initialData?.serialNumber || '',
    price: initialData?.price || '',
    notes: initialData?.notes || '',
    assignedTechId: initialData?.assignedTechId ?? null,
    assignedTechName: initialData?.assignedTechName || '',
    signatureDataUrl: null,
    signatureStrokes: null,
  };
}

/** Format a 10-digit phone as `xxx-xxx-xxxx`; pass through anything else. */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  return phone;
}
