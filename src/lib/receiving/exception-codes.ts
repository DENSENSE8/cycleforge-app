/**
 * OS&D (Over / Short / Damaged) exception taxonomy for inbound receiving
 * (receiving-triage streamline Phase 5). Single source of truth for the
 * `receiving.exception_code` values, their display labels, and tones — so the
 * write sites (lookup-po, mark-received) and the Unfound triage chip/filter
 * agree by construction. Mirrors the migration 2026-06-08_receiving_exception_code.
 *
 * This registry now carries THREE sub-vocabularies under the one
 * `flow_context = 'receiving_exception'`:
 *
 *  1. **OS&D codes** (`NO_PO` … `RETURN_NO_ORDER`) — what was wrong with the
 *     shipment itself. Written by lookup-po / mark-received.
 *  2. **Photo-policy override codes** (`PHOTO_WAIVED_*`) — why an operator
 *     consciously received a carton that the photo-evidence gate had blocked.
 *     Narrowed by `PHOTO_POLICY_OVERRIDE_CODES` so the receive routes validate
 *     an override against the override vocabulary ONLY: an operator must not be
 *     able to waive the photo gate with `NO_PO`, and an OS&D write must not be
 *     able to claim a photo waiver.
 *  3. **Loss codes** (`LOST_IN_TRANSIT` … `STOLEN`) — the goods are not here and
 *     are not coming. Narrowed by `LOSS_EXCEPTION_CODES` for the same reason.
 *
 * All three stay a SYSTEM vocabulary (they are behavior-bearing); tenants may
 * relabel them via the seeded `reason_codes` rows, never add to them.
 *
 * ⚠ **Array position IS the `sort_order` contract.** `seedOrgCatalog`
 * (`src/lib/neon/catalog-queries.ts`) walks `RECEIVING_EXCEPTION_CODES` assigning
 * 10, 20, 30 … and the seed migrations `2026-06-28d` (10–60), `2026-07-29b`
 * (70–110) and `2026-07-29i` (120–150) HARDCODE the numbers that walk produces.
 * A new code therefore goes at the **END** of the composed array — never spliced
 * into an earlier sub-vocabulary, which would renumber every code after it and
 * silently desync pre-existing orgs from newly-seeded ones. Pinned by
 * `exception-codes.test.ts`.
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

/**
 * Loss sub-vocabulary — the goods are NOT here and are not coming, so the line is
 * written off rather than received. Set on the delivered-not-unboxed lane when a
 * carrier-delivered carton never physically materialized (or arrived empty).
 *
 * **Not for a merely late shipment.** A box that is delivered and simply hasn't
 * been opened yet is the normal state of that lane — it carries an age band, not
 * an exception code. These codes are the terminal answer.
 *
 * Narrow + route-validated for the same reason as `PHOTO_POLICY_OVERRIDE_CODES`: a
 * write-off is a safety classification, so the resolution route validates against
 * THIS list only — an operator must not be able to write a carton off as `SHORT`,
 * and an OS&D write must not be able to claim a loss.
 *
 * Appended at the END of the composed array (not into `OSD_EXCEPTION_CODES`, where
 * they logically belong) to preserve the existing `sort_order` numbering — see the
 * array-position warning in the file header.
 */
export const LOSS_EXCEPTION_CODES = [
  'LOST_IN_TRANSIT',
  'EMPTY_BOX',
  'MISDELIVERED',
  'STOLEN',
] as const;

/**
 * QA-fail sub-vocabulary — the two failure modes the OS&D block cannot express.
 * A unit that powers on but does not work, and a unit that arrived complete as a
 * package but is missing parts, are neither `SHORT` (a count against the PO) nor
 * `DAMAGED` (physical harm). Without them a QA fail had nowhere structured to go,
 * which is why the mobile QA sheet's fail reason was a free-text field posted as
 * the operator's item note — see `QA_FAIL_EXCEPTION_CODES` below.
 *
 * Only these two are NEW: `DAMAGED` is already the right code for a damaged unit,
 * so the fail vocabulary reuses it rather than minting a prefixed twin.
 *
 * Appended at the END of the composed array (see the header warning): splicing
 * them next to `DAMAGED`, where they logically belong, would renumber every
 * photo-override and loss code that 2026-07-29b/i hardcoded.
 */
const QA_FAIL_ONLY_CODES = ['DEFECTIVE', 'INCOMPLETE'] as const;

/** All four sub-vocabularies, in seed order. Order is the `sort_order` contract. */
export const RECEIVING_EXCEPTION_CODES = [
  ...OSD_EXCEPTION_CODES,
  ...PHOTO_POLICY_OVERRIDE_CODES,
  ...LOSS_EXCEPTION_CODES,
  ...QA_FAIL_ONLY_CODES,
] as const;

/**
 * The ONLY codes a QA fail may be recorded under, and the `qa_status` each one
 * means. A deliberately narrow slice like `PHOTO_POLICY_OVERRIDE_CODES` — the
 * receive route validates against THIS map, so a fail cannot be filed as `NO_PO`
 * and a write-off cannot arrive dressed as a QA verdict.
 *
 * It is a MAP, not a list, because the failure reason and the QA verdict are the
 * same fact at two grains: the mobile sheet used to post a hardcoded
 * `FAILED_FUNCTIONAL` for every fail and put the real reason in free text, so a
 * damaged unit and a dead unit were indistinguishable in the column built to tell
 * them apart. Deriving one from the other makes that impossible.
 *
 * It spans two sub-vocabularies on purpose (`DAMAGED` is OS&D) — the seed-order
 * arrays are the `sort_order` contract; this is the semantic slice.
 */
export const QA_FAIL_EXCEPTION_STATUS = {
  DEFECTIVE: 'FAILED_FUNCTIONAL',
  DAMAGED: 'FAILED_DAMAGED',
  INCOMPLETE: 'FAILED_INCOMPLETE',
} as const;

export type ReceivingExceptionCode = (typeof RECEIVING_EXCEPTION_CODES)[number];
export type PhotoPolicyOverrideCode = (typeof PHOTO_POLICY_OVERRIDE_CODES)[number];
export type QaFailExceptionCode = keyof typeof QA_FAIL_EXCEPTION_STATUS;
export type QaFailStatus = (typeof QA_FAIL_EXCEPTION_STATUS)[QaFailExceptionCode];
/**
 * Deliberately module-private: nothing outside this file NAMES it, and an
 * exported-but-unconsumed type is dead code (knip gate). `isLossExceptionCode`
 * still narrows correctly for callers, and the write-off path carries its own
 * module-local alias off `LOSS_EXCEPTION_CODES`. Export it only when a consumer
 * genuinely needs to annotate with it.
 */
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

/**
 * SQL predicate (aliases `rl`) — TRUE when a line has NO open loss exception, i.e.
 * it has not been written off. The delivered-not-unboxed feed's exit rule.
 *
 * Keys off `receiving_exceptions.status = 'OPEN'` rather than the denormalized
 * `receiving_line.exception_code`, which makes the write-off **reversible for
 * free**: `resolveReceivingExceptions()` flips the row to RESOLVED and the line
 * returns to the lane. (The column cannot express that — `transitionReceivingLine`
 * writes `exception_code = COALESCE($5, exception_code)`, so it can set but never
 * clear.) The append-only exception row keeps the original write-off in history.
 *
 * A pure string with no DB import, co-located with the vocabulary it is derived
 * from — same shape as `INBOUND_SOURCE_SYSTEMS` / `INBOUND_SHIPMENT_PREDICATE` in
 * `delivered-unscanned.ts`. Interpolation is safe: the values are this module's own
 * `[A-Z_]` literals, never caller input.
 */
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
