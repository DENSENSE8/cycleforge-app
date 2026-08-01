/**
 * QA-fail reason WIRE tokens — the half of the fail contract both the receive
 * route and the bench UI need.
 *
 * A QA fail reason is a receiving EXCEPTION, not a note. The mobile QA action
 * sheet used to offer free text and post it to `mark-received` as `notes`, i.e.
 * the operator's item note (`.claude/rules/source-of-truth.md` → Note vs label
 * grain): a phone-side fail would have overwritten whatever the desktop operator
 * typed, on every line in the carton, and the reason itself stayed unqueryable
 * prose. It now travels as a code from the narrow `QA_FAIL_EXCEPTION_STATUS`
 * slice plus optional detail, and lands in `receiving_exceptions`.
 *
 * Same shape and the same reason as `./photo-policy-override-wire.ts`: pure,
 * dependency-free (only the pure `./exception-codes` registry), so both sides
 * import ONE definition of each wire string instead of a client copy that drifts.
 */

import {
  QA_FAIL_EXCEPTION_STATUS,
  RECEIVING_EXCEPTION_META,
  type QaFailExceptionCode,
} from './exception-codes';

/**
 * `flow_context` the QA-fail codes are seeded into, so a tenant can relabel them
 * (`reason_codes`). The vocabulary itself stays the system registry — a tenant
 * may rename an option, never add one.
 */
export const QA_FAIL_REASON_FLOW_CONTEXT = 'receiving_exception';

/**
 * The receive-request fields that record a fail reason.
 *
 * `code` is REQUIRED with no default: absence of a reason is expressed by NOT
 * calling this (a PASS), never by a defaulted code. A default here would file
 * every caller that forgot to think about it under someone else's reason —
 * `.claude/rules/backend-patterns.md` → a safety classification is never
 * defaulted.
 *
 * `qa_status` is deliberately ABSENT: the route derives it from the code, so the
 * verdict and the reason cannot disagree on the wire.
 */
export function qaFailReasonFields(
  code: QaFailExceptionCode,
  reason: string | null,
): { exception_code: QaFailExceptionCode; exception_reason: string | null } {
  return { exception_code: code, exception_reason: reason?.trim() || null };
}

/** One selectable fail reason. */
export interface QaFailReasonOption {
  code: QaFailExceptionCode;
  /** Tenant label when the vocabulary is seeded, else the registry label. */
  label: string;
  /** Registry description — what the operator is actually claiming. */
  description: string;
}

/** Registry order — the order the operator sees, and the order they are seeded in. */
const QA_FAIL_REASON_CODES = Object.keys(QA_FAIL_EXCEPTION_STATUS) as QaFailExceptionCode[];

/**
 * The pickable reasons, in registry order.
 *
 * Walks the REGISTRY and only borrows a tenant label, exactly like
 * `buildPhotoPolicyOverrideOptions`: the route validates against
 * `isQaFailExceptionCode`, so an unseeded org, a failed vocabulary fetch, and a
 * tenant who added their own `receiving_exception` row all render precisely the
 * codes the server will accept. Offering an option the server rejects is the
 * failure mode this ordering prevents.
 */
export function buildQaFailReasonOptions(
  vocabulary: readonly { code: string; label: string }[] | null | undefined,
): QaFailReasonOption[] {
  const labels = new Map<string, string>();
  for (const row of vocabulary ?? []) {
    const label = String(row?.label ?? '').trim();
    if (label) labels.set(String(row?.code ?? ''), label);
  }
  return QA_FAIL_REASON_CODES.map((code) => ({
    code,
    label: labels.get(code) || RECEIVING_EXCEPTION_META[code].label,
    description: RECEIVING_EXCEPTION_META[code].description,
  }));
}
