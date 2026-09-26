/** Photo-policy gate WIRE tokens — the half of the override contract both the routes and the bench UI need (WS-PHOTO §4). */

import {
  PHOTO_POLICY_OVERRIDE_CODES,
  RECEIVING_EXCEPTION_META,
  isPhotoPolicyOverrideCode,
  type PhotoPolicyOverrideCode,
} from './exception-codes';

/**
 * Shared token on BOTH sides of the gate contract: the 409 `error` and the 200
 * `warnings[].code`. One symbol so a block and a waived-block never drift.
 */
export const PHOTO_POLICY_ERROR_CODE = 'PHOTO_POLICY';

/** Request-body key the receive routes read the override from. */
export const PHOTO_POLICY_OVERRIDE_BODY_KEY = 'photo_policy_override';

/**
 * `flow_context` the `PHOTO_WAIVED_*` codes are seeded into, so a tenant can
 * relabel them (`reason_codes`). The vocabulary itself stays the system
 * registry — a tenant may rename an option, never add one.
 */
export const PHOTO_POLICY_OVERRIDE_FLOW_CONTEXT = 'receiving_exception';

/** The request field that turns the hard 409 into a waived receive. */
export function photoPolicyOverrideField(
  code: PhotoPolicyOverrideCode,
): { [PHOTO_POLICY_OVERRIDE_BODY_KEY]: PhotoPolicyOverrideCode } {
  return { [PHOTO_POLICY_OVERRIDE_BODY_KEY]: code };
}

/**
 * Operator-readable blocker strings off a gate payload (409 body or warning).
 * Module-local on purpose: the two readers below are its only callers, and this
 * module's own rule is that a speculative export is new dead code.
 */
function readPhotoPolicyBlockers(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((b) => String(b ?? '').trim()).filter(Boolean);
}

/**
 * A gate block that the operator can consciously override. Consumers use it
 * only as the inferred return of {@link readPhotoPolicyBlock}, so it stays
 * module-local rather than an exported name nobody imports.
 */
interface PhotoPolicyBlock {
  blockers: string[];
}

/** A gate block that WAS overridden — what the 200 response reports back. */
export interface PhotoPolicyWaiver {
  reasonCode: PhotoPolicyOverrideCode;
  blockers: string[];
}

/** Read the 409 block off a response body. */
export function readPhotoPolicyBlock(status: number, body: unknown): PhotoPolicyBlock | null {
  if (status !== 409) return null;
  const payload = (body ?? {}) as { error?: unknown; blockers?: unknown };
  if (payload.error !== PHOTO_POLICY_ERROR_CODE) return null;
  return { blockers: readPhotoPolicyBlockers(payload.blockers) };
}

/**
 * Read the waiver off a 200 body's `warnings[]`. A receive that skipped the
 * evidence gate must never render as a clean success, so every surface reads
 * this through the same parser instead of eyeballing the array shape.
 */
export function readPhotoPolicyWaiver(body: unknown): PhotoPolicyWaiver | null {
  const warnings = (body as { warnings?: unknown } | null)?.warnings;
  if (!Array.isArray(warnings)) return null;
  for (const raw of warnings) {
    const w = (raw ?? {}) as { code?: unknown; reason_code?: unknown; blockers?: unknown };
    if (w.code !== PHOTO_POLICY_ERROR_CODE) continue;
    const reasonCode = typeof w.reason_code === 'string' ? w.reason_code.trim() : '';
    if (!isPhotoPolicyOverrideCode(reasonCode)) continue;
    return { reasonCode, blockers: readPhotoPolicyBlockers(w.blockers) };
  }
  return null;
}

/** One selectable override reason. */
export interface PhotoPolicyOverrideOption {
  code: PhotoPolicyOverrideCode;
  /** Tenant label when the vocabulary is seeded, else the registry label. */
  label: string;
  /** Registry description — what the operator is actually claiming. */
  description: string;
}

/** The pickable options, in registry order. */
export function buildPhotoPolicyOverrideOptions(
  vocabulary: readonly { code: string; label: string }[] | null | undefined,
): PhotoPolicyOverrideOption[] {
  const labels = new Map<string, string>();
  for (const row of vocabulary ?? []) {
    const label = String(row?.label ?? '').trim();
    if (label) labels.set(String(row?.code ?? ''), label);
  }
  return PHOTO_POLICY_OVERRIDE_CODES.map((code) => ({
    code,
    label: labels.get(code) || RECEIVING_EXCEPTION_META[code].label,
    description: RECEIVING_EXCEPTION_META[code].description,
  }));
}

/** Label for a waiver code (registry only — for read-only receipts). */
export function photoPolicyOverrideLabel(code: PhotoPolicyOverrideCode): string {
  return RECEIVING_EXCEPTION_META[code].label;
}
