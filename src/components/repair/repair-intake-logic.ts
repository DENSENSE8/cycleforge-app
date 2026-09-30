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

/** The CONTACT half only — the customer's own details. */
function isContactCompleteFor(
  data: RepairFormData,
  devices?: readonly RepairDeviceGateRow[],
): boolean {
  if (!devices) return isContactComplete(data);
  return CONTACT_FIELDS.filter((field) => field !== 'extras').every((field) =>
    isContactFieldValid(field, data),
  );
}

/** The DEVICE facts a gate needs, per unit on the counter. */
export interface RepairDeviceGateRow {
  title: string;
  serialNumber: string;
  price: string;
  /** This unit's own reasons — reasons are a LINE fact on the kiosk. */
  repairReasons: readonly string[];
}

/** Is there an issue on the paperwork for every unit? */
function issueSatisfied(data: RepairFormData, devices?: readonly RepairDeviceGateRow[]): boolean {
  if (!devices) return hasRepairIssue(data);
  if (data.repairNotes.trim()) return true;
  return devices.length > 0 && devices.every((d) => d.repairReasons.length > 0);
}

/** Is every device serialised and quoted? */
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

/** The kiosk pane's FOUR touch steps as satisfied/unsatisfied gates: */
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

/**
 * Why the kiosk step in view cannot advance — the sentence the floor prints
 * above a disabled Continue. `null` when the step's gate is satisfied.
 *
 * One reason per gate in {@link repairStepGates}, same order, so the key and
 * its sentence can never disagree. It exists because the reason used to ride
 * only on the key's `title`, and a tooltip does not exist under a finger: on
 * the counter iPad a greyed Continue said nothing at all. The last step reuses
 * {@link getRepairSubmitBlockReason} (the one copy deck for submit gaps) plus
 * the unsettled ticket, exactly as the review floor already words it.
 */
export function repairStepBlockReason(
  step: 0 | 1 | 2 | 3,
  data: RepairFormData,
  hasSignature: boolean,
  ticketSettled: boolean,
  devices?: readonly RepairDeviceGateRow[],
): string | null {
  const gates = repairStepGates(data, hasSignature, ticketSettled, devices);
  if (gates[step]) return null;
  switch (step) {
    case 0: {
      // Reasons are per unit: with several devices, name the one still blank.
      const short =
        devices && devices.length > 1 ? devices.find((d) => d.repairReasons.length === 0) : null;
      return short
        ? `${short.title} still needs a reason for repair`
        : 'Pick a reason or add a note to continue';
    }
    case 1: {
      if (devices && devices.length === 0) return 'Add the device being dropped off';
      const short = devices?.find((d) => !d.serialNumber.trim() || !d.price.trim());
      const serialMissing = short ? !short.serialNumber.trim() : !data.serialNumber.trim();
      const priceMissing = short ? !short.price.trim() : !data.price.trim();
      const missing = [serialMissing ? 'serial number' : null, priceMissing ? 'price' : null]
        .filter(Boolean)
        .join(' and ');
      return devices && devices.length > 1 && short
        ? `${short.title} still needs its ${missing}`
        : `Add the ${missing} to continue`;
    }
    case 2:
      return "Enter the customer's phone number to continue";
    case 3:
      return (
        getRepairSubmitBlockReason(data, hasSignature, devices) ??
        'Pick the existing ticket to attach this repair to'
      );
  }
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
