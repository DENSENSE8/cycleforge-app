/**
 * Photo-policy gate OVERRIDE — the soft-block half of the receiving
 * photo-evidence gate (WS-PHOTO §4,
 * docs/todo/photo-evidence-policy-claims-insurance-plan.md).
 *
 * The gate itself (`./photo-policy-gate.ts` → `./photo-policy.ts`) is untouched
 * and still returns the same verdict; this module owns only what a receive
 * route does with a `!ok` verdict:
 *
 * - **No override supplied** → the route still returns the byte-identical
 *   `409 { error: 'PHOTO_POLICY', blockers }`. That is the default and it must
 *   stay the default: an operator who simply hasn't shot the photos yet is
 *   blocked exactly as before.
 * - **Override supplied** → the receive proceeds, the response carries a
 *   `warnings` entry with the same blockers, ONE `receiving_exceptions` row is
 *   written per received line, and a dedicated audit row is recorded. An
 *   override with no trail is worse than no gate at all.
 *
 * The override is a **safety classification, not a note**: the only accepted
 * values are the `PHOTO_WAIVED_*` slice of the receiving-exception system
 * registry (`PHOTO_POLICY_OVERRIDE_CODES`), validated server-side. There is
 * deliberately no free-text field on this path — the human-readable `reason`
 * persisted alongside the code is assembled HERE from the gate's own blockers,
 * never from the request body, so a client can neither invent a justification
 * nor smuggle one past the vocabulary.
 *
 * `code` is a required parameter with no default everywhere it appears
 * (`.claude/rules/backend-patterns.md` → "a safety classification is a REQUIRED
 * parameter"): a defaulted override code would silently waive the gate for
 * every call site that forgot to pass one.
 *
 * Deps-injected (default = the real `recordReceivingException`) so unit tests
 * run DB-free. The `Deps`/input shapes are deliberately module-LOCAL: only the
 * five symbols the receive routes actually call are exported, and structural
 * typing means a test can still inject `{ recordException: fake }` without
 * importing a type. Widen an export when a second real consumer appears — not
 * before (the knip gate treats a speculative export as new dead code).
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { recordReceivingException } from './exceptions';
import {
  PHOTO_POLICY_OVERRIDE_CODES,
  isPhotoPolicyOverrideCode,
  type PhotoPolicyOverrideCode,
} from './exception-codes';
import {
  PHOTO_POLICY_ERROR_CODE,
  PHOTO_POLICY_OVERRIDE_BODY_KEY,
} from './photo-policy-override-wire';

/**
 * The wire tokens now live in the dependency-free `./photo-policy-override-wire`
 * so the BENCH UI can read the same strings without importing this module —
 * which reaches `./exceptions` → `@/lib/tenancy/db` (`server-only`). Re-exported
 * here so the receive routes keep their import path unchanged.
 */
export { PHOTO_POLICY_OVERRIDE_BODY_KEY };

/** 400 discriminator for an override value outside the system vocabulary. */
const PHOTO_POLICY_OVERRIDE_INVALID = 'INVALID_PHOTO_POLICY_OVERRIDE';

type PhotoPolicyOverrideParse =
  /** No override on the request — the gate stays a hard 409. */
  | { state: 'absent' }
  /** A recognized `PHOTO_WAIVED_*` code. */
  | { state: 'valid'; code: PhotoPolicyOverrideCode }
  /** Present but not in the vocabulary — reject the request outright. */
  | { state: 'invalid' };

/**
 * Classify the raw body value. Absent/blank is NOT an error (the vast majority
 * of receives never touch the gate); anything present but unrecognized IS —
 * a client claiming a waiver we can't name must never be allowed to proceed,
 * even when the gate would have passed it anyway.
 */
export function parsePhotoPolicyOverride(raw: unknown): PhotoPolicyOverrideParse {
  if (raw === undefined || raw === null) return { state: 'absent' };
  if (typeof raw !== 'string') return { state: 'invalid' };
  const trimmed = raw.trim();
  if (trimmed === '') return { state: 'absent' };
  if (!isPhotoPolicyOverrideCode(trimmed)) return { state: 'invalid' };
  return { state: 'valid', code: trimmed };
}

/** 400 body for an override outside the vocabulary — echoes the allowed set. */
export function photoPolicyOverrideInvalidBody(): {
  success: false;
  error: typeof PHOTO_POLICY_OVERRIDE_INVALID;
  allowed: readonly PhotoPolicyOverrideCode[];
} {
  return {
    success: false,
    error: PHOTO_POLICY_OVERRIDE_INVALID,
    allowed: PHOTO_POLICY_OVERRIDE_CODES,
  };
}

interface PhotoPolicyOverrideWarning {
  code: typeof PHOTO_POLICY_ERROR_CODE;
  /** The `PHOTO_WAIVED_*` code the operator selected. */
  reason_code: PhotoPolicyOverrideCode;
  /** The gate blockers that were waived — the same strings the 409 carries. */
  blockers: string[];
}

/**
 * The `warnings[]` entry a waived receive returns at 200. Deliberately mirrors
 * the 409 payload (`code` ≡ `error`, same `blockers`) so a client renders one
 * copy from either shape.
 */
export function photoPolicyOverrideWarning(
  code: PhotoPolicyOverrideCode,
  blockers: readonly string[],
): PhotoPolicyOverrideWarning {
  return { code: PHOTO_POLICY_ERROR_CODE, reason_code: code, blockers: [...blockers] };
}

/** Cap on the server-assembled `reason` text (the column is unbounded `text`). */
const MAX_REASON_LENGTH = 500;

/**
 * Human-readable "what was waived", assembled from the gate's own blockers.
 * Server-generated by construction — the request body never contributes text
 * to this path.
 */
function photoPolicyOverrideReason(blockers: readonly string[]): string {
  const joined = blockers.map((b) => String(b).trim()).filter(Boolean).join('; ');
  const body = joined || 'photo-evidence policy not satisfied';
  const text = `Photo policy waived at receive: ${body}`;
  return text.length > MAX_REASON_LENGTH ? `${text.slice(0, MAX_REASON_LENGTH - 1)}…` : text;
}

interface RecordPhotoPolicyOverrideInput {
  /** REQUIRED — never defaulted; see the module header. */
  code: PhotoPolicyOverrideCode;
  /** The gate verdict's blockers, verbatim. */
  blockers: readonly string[];
  /** Carton the gate scoped evidence to (nullable column on the table). */
  receivingId: number | null;
  /**
   * Every line the receive actually touched. One exception row per line: the
   * table is line-level, the waiver applies to the whole receive act, and
   * `require_one` blockers are carton-level (no single line is "the" culprit).
   */
  receivingLineIds: readonly number[];
  staffId: number | null;
}

interface PhotoPolicyOverrideDeps {
  recordException: typeof recordReceivingException;
}

const defaultDeps: PhotoPolicyOverrideDeps = { recordException: recordReceivingException };

/** Positive, whole, de-duplicated line ids in first-seen order. */
function normalizeLineIds(ids: readonly number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const raw of ids) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    const id = Math.floor(n);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Persist the override as OPEN `receiving_exceptions` rows. Returns the created
 * ids (empty when there was no resolvable line — the caller still audits, so
 * the act is never silent).
 */
export async function recordPhotoPolicyOverride(
  orgId: OrgId,
  input: RecordPhotoPolicyOverrideInput,
  deps: PhotoPolicyOverrideDeps = defaultDeps,
): Promise<{ exceptionIds: number[] }> {
  const lineIds = normalizeLineIds(input.receivingLineIds);
  if (lineIds.length === 0) return { exceptionIds: [] };

  const reason = photoPolicyOverrideReason(input.blockers);
  const exceptionIds: number[] = [];
  for (const receivingLineId of lineIds) {
    const { id } = await deps.recordException(orgId, {
      receivingLineId,
      receivingId: input.receivingId ?? null,
      exceptionCode: input.code,
      reason,
      createdBy: input.staffId ?? null,
    });
    exceptionIds.push(id);
  }
  return { exceptionIds };
}
