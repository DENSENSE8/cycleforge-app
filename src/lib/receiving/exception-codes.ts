/** OS&D (Over / Short / Damaged) exception taxonomy for inbound receiving (receiving-triage streamline Phase 5). */

/** OS&D sub-vocabulary — what was wrong with the shipment itself. */
const OSD_EXCEPTION_CODES = [
  'NO_PO',
  'CARRIER_MISMATCH',
  'SHORT',
  'OVER',
  'DAMAGED',
  'WRONG_ITEM',
  'RETURN_NO_ORDER',
] as const;

/** The ONLY codes that may be supplied as a photo-policy gate override. */
export const PHOTO_POLICY_OVERRIDE_CODES = [
  'PHOTO_WAIVED_NO_DEVICE',
  'PHOTO_WAIVED_UPLOAD_FAILED',
  'PHOTO_WAIVED_NOT_APPLICABLE',
  'PHOTO_WAIVED_DEFERRED',
] as const;

/** Loss sub-vocabulary — the goods are NOT here and are not coming, so the line is written off rather than received. */
export const LOSS_EXCEPTION_CODES = [
  'LOST_IN_TRANSIT',
  'EMPTY_BOX',
  'MISDELIVERED',
  'STOLEN',
] as const;

/** QA-fail sub-vocabulary — the two failure modes the OS&D block cannot express. */
const QA_FAIL_ONLY_CODES = ['DEFECTIVE', 'INCOMPLETE'] as const;

/** All four sub-vocabularies, in seed order. Order is the `sort_order` contract. */
export const RECEIVING_EXCEPTION_CODES = [
  ...OSD_EXCEPTION_CODES,
  ...PHOTO_POLICY_OVERRIDE_CODES,
  ...LOSS_EXCEPTION_CODES,
  ...QA_FAIL_ONLY_CODES,
] as const;

/** The ONLY codes a QA fail may be recorded under, and the `qa_status` each one means. */
export const QA_FAIL_EXCEPTION_STATUS = {
  DEFECTIVE: 'FAILED_FUNCTIONAL',
  DAMAGED: 'FAILED_DAMAGED',
  INCOMPLETE: 'FAILED_INCOMPLETE',
} as const;

export type ReceivingExceptionCode = (typeof RECEIVING_EXCEPTION_CODES)[number];
export type PhotoPolicyOverrideCode = (typeof PHOTO_POLICY_OVERRIDE_CODES)[number];
export type QaFailExceptionCode = keyof typeof QA_FAIL_EXCEPTION_STATUS;
/** Deliberately module-private: */
type LossExceptionCode = (typeof LOSS_EXCEPTION_CODES)[number];

export function isReceivingExceptionCode(v: string | null | undefined): v is ReceivingExceptionCode {
  return v != null && (RECEIVING_EXCEPTION_CODES as readonly string[]).includes(v);
}

export function isPhotoPolicyOverrideCode(v: string | null | undefined): v is PhotoPolicyOverrideCode {
  return v != null && (PHOTO_POLICY_OVERRIDE_CODES as readonly string[]).includes(v);
}

/**
 * Validate a write-off reason. The loss-resolution path validates against THIS
 * guard, never `isReceivingExceptionCode` — the whole point of the narrow slice is
 * that an OS&D code cannot be used to write a carton off.
 */
export function isLossExceptionCode(v: string | null | undefined): v is LossExceptionCode {
  return v != null && (LOSS_EXCEPTION_CODES as readonly string[]).includes(v);
}

/**
 * Validate a QA-fail reason. The receive route validates against THIS guard, never
 * `isReceivingExceptionCode` — same narrowing rationale as the two guards above.
 */
export function isQaFailExceptionCode(v: string | null | undefined): v is QaFailExceptionCode {
  return v != null && Object.prototype.hasOwnProperty.call(QA_FAIL_EXCEPTION_STATUS, v);
}

interface ExceptionMeta {
  label: string;
  /** Tailwind chip classes (bg/text/ring). */
  tone: string;
  description: string;
}

export const RECEIVING_EXCEPTION_META: Record<ReceivingExceptionCode, ExceptionMeta> = {
  NO_PO: {
    label: 'No PO',
    tone: 'bg-surface-sunken text-text-muted ring-border-soft',
    description: 'Scanned carton with no matching Zoho purchase order.',
  },
  CARRIER_MISMATCH: {
    label: 'Carrier?',
    tone: 'bg-rose-100 text-rose-700 ring-rose-200',
    description: 'Tracking number has no known carrier or the carrier has no record of it.',
  },
  SHORT: {
    label: 'Short',
    tone: 'bg-amber-100 text-amber-700 ring-amber-200',
    description: 'Fewer units received than the PO expected.',
  },
  OVER: {
    label: 'Over',
    tone: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
    description: 'More units received than the PO expected.',
  },
  DAMAGED: {
    label: 'Damaged',
    tone: 'bg-red-100 text-red-700 ring-red-200',
    description: 'Unit(s) arrived damaged.',
  },
  WRONG_ITEM: {
    label: 'Wrong item',
    tone: 'bg-orange-100 text-orange-700 ring-orange-200',
    description: "Received SKU doesn't match the PO line.",
  },
  RETURN_NO_ORDER: {
    label: 'Return · no order',
    tone: 'bg-amber-100 text-amber-700 ring-amber-200',
    description: 'Returned unit with no matching sales order — logged for investigation.',
  },
  PHOTO_WAIVED_NO_DEVICE: {
    label: 'No camera',
    tone: 'bg-surface-sunken text-text-muted ring-border-soft',
    description: 'Received without the required photos — no working camera at this bench.',
  },
  PHOTO_WAIVED_UPLOAD_FAILED: {
    label: 'Upload failed',
    tone: 'bg-amber-100 text-amber-700 ring-amber-200',
    description: 'Photos were taken but would not upload — received to keep the bench moving.',
  },
  PHOTO_WAIVED_NOT_APPLICABLE: {
    label: 'Not applicable',
    tone: 'bg-surface-sunken text-text-muted ring-border-soft',
    description: 'Nothing to photograph for this carton (e.g. sealed pallet, documents only).',
  },
  PHOTO_WAIVED_DEFERRED: {
    label: 'Photos to follow',
    tone: 'bg-amber-100 text-amber-700 ring-amber-200',
    description: 'Received now; the required photos will be attached to this carton later.',
  },
  // Loss family shares ONE heavier rose step (200/800/300) so a terminal write-off
  // reads as a distinct severity from the recoverable rose-100 CARRIER_MISMATCH.
  // The hue says "delivery went wrong"; the weight says "this is the final answer".
  LOST_IN_TRANSIT: {
    label: 'Lost',
    tone: 'bg-rose-200 text-rose-800 ring-rose-300',
    description: 'Carrier marked the carton delivered but it never reached the dock.',
  },
  EMPTY_BOX: {
    label: 'Empty box',
    tone: 'bg-rose-200 text-rose-800 ring-rose-300',
    description: 'Carton arrived and was opened — the item was not inside.',
  },
  MISDELIVERED: {
    label: 'Misdelivered',
    tone: 'bg-rose-200 text-rose-800 ring-rose-300',
    description: 'Carrier delivered to the wrong address, suite, or mailroom.',
  },
  STOLEN: {
    label: 'Stolen',
    tone: 'bg-rose-200 text-rose-800 ring-rose-300',
    description: 'Confirmed theft after the carrier delivery scan.',
  },
  // QA-fail family — a verdict on the UNIT, so it shares DAMAGED's red hue at the
  // recoverable 100/700 weight (the goods are here; they are going back).
  DEFECTIVE: {
    label: 'Defective',
    tone: 'bg-red-100 text-red-700 ring-red-200',
    description: 'Unit is present and undamaged but does not work.',
  },
  INCOMPLETE: {
    label: 'Missing parts',
    tone: 'bg-orange-100 text-orange-700 ring-orange-200',
    description: 'Unit arrived without accessories, cables, or parts it needs.',
  },
};

/** SQL predicate (aliases `rl`) — TRUE when a line has NO open loss exception, i.e. */
export const NO_OPEN_LOSS_EXCEPTION_PREDICATE = `NOT EXISTS (
             SELECT 1 FROM receiving_exceptions re_loss
              WHERE re_loss.receiving_line_id = rl.id
                AND re_loss.organization_id = rl.organization_id
                AND re_loss.status = 'OPEN'
                AND re_loss.exception_code IN (${LOSS_EXCEPTION_CODES.map((c) => `'${c}'`).join(',')})
           )`;

/** Display label for an exception code (empty string when none/unknown). */
export function receivingExceptionLabel(code: string | null | undefined): string {
  return isReceivingExceptionCode(code) ? RECEIVING_EXCEPTION_META[code].label : '';
}
