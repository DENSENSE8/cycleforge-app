/**
 * OS&D (Over / Short / Damaged) exception taxonomy for inbound receiving
 * (receiving-triage streamline Phase 5). Single source of truth for the
 * `receiving.exception_code` values, their display labels, and tones — so the
 * write sites (lookup-po, mark-received) and the Unfound triage chip/filter
 * agree by construction. Mirrors the migration 2026-06-08_receiving_exception_code.
 *
 * This registry now carries TWO sub-vocabularies under the one
 * `flow_context = 'receiving_exception'`:
 *
 *  1. **OS&D codes** (`NO_PO` … `RETURN_NO_ORDER`) — what was wrong with the
 *     shipment itself. Written by lookup-po / mark-received.
 *  2. **Photo-policy override codes** (`PHOTO_WAIVED_*`) — why an operator
 *     consciously received a carton that the photo-evidence gate had blocked.
 *     Narrowed by `PHOTO_POLICY_OVERRIDE_CODES` so the receive routes validate
 *     an override against the override vocabulary ONLY: an operator must not be
 *     able to waive the photo gate with `NO_PO`, and an OS&D write must not be
 *     able to claim a photo waiver. Both halves stay a SYSTEM vocabulary (they
 *     are behavior-bearing); tenants may relabel them via the seeded
 *     `reason_codes` rows, never add to them.
 */

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

/**
 * The ONLY codes that may be supplied as a photo-policy gate override. A
 * deliberately narrow slice of the receiving-exception vocabulary — an override
 * is a safety classification, so the receive routes validate against THIS list
 * and reject anything else (including a tenant-authored `reason_codes` row).
 * Do NOT widen this to "any non-empty string"; that is exactly the free-text
 * conduit this vocabulary exists to prevent (contrast
 * `isValidSerialAbsentReason`, which must not be copied here).
 *
 * Order matters: these compose onto the END of `RECEIVING_EXCEPTION_CODES`
 * because `seedOrgCatalog` assigns `sort_order` by array position (10, 20, …),
 * and the seed migration 2026-07-29b hardcodes the same numbers (80–110) for
 * orgs that already exist.
 */
export const PHOTO_POLICY_OVERRIDE_CODES = [
  'PHOTO_WAIVED_NO_DEVICE',
  'PHOTO_WAIVED_UPLOAD_FAILED',
  'PHOTO_WAIVED_NOT_APPLICABLE',
  'PHOTO_WAIVED_DEFERRED',
] as const;

/** Both sub-vocabularies, in seed order. */
export const RECEIVING_EXCEPTION_CODES = [
  ...OSD_EXCEPTION_CODES,
  ...PHOTO_POLICY_OVERRIDE_CODES,
] as const;

export type ReceivingExceptionCode = (typeof RECEIVING_EXCEPTION_CODES)[number];
export type PhotoPolicyOverrideCode = (typeof PHOTO_POLICY_OVERRIDE_CODES)[number];

export function isReceivingExceptionCode(v: string | null | undefined): v is ReceivingExceptionCode {
  return v != null && (RECEIVING_EXCEPTION_CODES as readonly string[]).includes(v);
}

export function isPhotoPolicyOverrideCode(v: string | null | undefined): v is PhotoPolicyOverrideCode {
  return v != null && (PHOTO_POLICY_OVERRIDE_CODES as readonly string[]).includes(v);
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
};

/** Display label for an exception code (empty string when none/unknown). */
export function receivingExceptionLabel(code: string | null | undefined): string {
  return isReceivingExceptionCode(code) ? RECEIVING_EXCEPTION_META[code].label : '';
}
