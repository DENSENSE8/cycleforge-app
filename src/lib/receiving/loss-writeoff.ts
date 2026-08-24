/**
 * Loss write-off — the terminal answer for a carrier-delivered carton whose goods
 * never physically materialized (Phase 3 of
 * docs/todo/ebay-delivered-not-unboxed-PLAN.md).
 *
 * Before this, a delivered-but-never-unboxed carton could only leave the
 * "Delivered · not unboxed" lane by aging out of the query window — the exception
 * vanished without anyone recording what happened to the goods, on exactly the
 * surface whose job is to notice that.
 *
 * **Shape: an exception row, NOT a lifecycle transition.** The write-off records
 * an OPEN `receiving_exceptions` row via the shared `recordReceivingException`
 * waist and leaves `workflow_status` alone. Two reasons, both load-bearing:
 *
 *  1. The PROBLEM dimension is deliberately ORTHOGONAL to the lifecycle —
 *     `workflow-stages.ts` keeps PROBLEM out of the status enum on purpose, so a
 *     line can be SCANNED + PROBLEM. There is no "lost" status to move to, and the
 *     nearest candidate is a trap: `FAILED` means *failed a QC test*, derives to
 *     coarse `RECEIVED`, and would make `transitionReceivingLine()` stamp
 *     `received_at` — recording that goods which never arrived were received.
 *  2. `receiving_exceptions` already carries an OPEN/RESOLVED lifecycle plus
 *     `resolveReceivingExceptions()`, so a carton that later turns up is reopened
 *     by resolving the row. A denormalized flag could not express that:
 *     `transitionReceivingLine` writes `exception_code = COALESCE($5, …)` and can
 *     set but never clear.
 *
 * **The code is a safety classification, not a note.** Only the `LOSS_EXCEPTION_CODES`
 * slice of the receiving-exception system registry is accepted, validated
 * server-side, and `code` is a REQUIRED parameter with no default
 * (`.claude/rules/backend-patterns.md` → "a safety classification is a REQUIRED
 * parameter, never a defaulted one"). A defaulted code would silently write every
 * caller's carton off as the same kind of lost.
 *
 * **Free text is bounded and cannot be the justification.** `reason` is assembled
 * HERE from the validated code and the carton's own delivery facts — the request
 * body never contributes to it — mirroring `photo-policy-override.ts`. An optional
 * operator `note` is accepted separately into `support_notes` because a claim needs
 * human evidence ("front-desk signed for it, box never came upstairs"), but it is
 * length-capped and can never stand in for the code.
 *
 * Deps-injected (default = the real writers) so unit tests run DB-free. Types are
 * module-LOCAL: only the symbols a real consumer calls are exported, since the knip
 * gate treats a speculative export as new dead code.
 */

import type { OrgId } from '@/lib/tenancy/constants';
// TYPE-only: `./exceptions` reaches `@/lib/tenancy/db` (`server-only`) at module
// load, which would make this module unimportable from a test (and drag the Neon
// pool behind any client that touched it). The real writers are resolved lazily in
// `realDeps()` — `.claude/rules/build-gotchas.md` → bundle altitude.
import type { recordReceivingException, resolveReceivingExceptions } from './exceptions';
import {
  LOSS_EXCEPTION_CODES,
  RECEIVING_EXCEPTION_META,
  isLossExceptionCode,
} from './exception-codes';
import { NO_SESSION } from '@/lib/sessions/attribution';

/** Exported for the resolution route's 400 discriminator and its test. */
export const LOSS_WRITEOFF_INVALID_CODE = 'INVALID_LOSS_CODE';

/** Cap on the operator note (the column is unbounded `text`). */
const MAX_NOTE_LENGTH = 500;

/** Cap on the server-assembled reason. */
const MAX_REASON_LENGTH = 500;

type LossCode = (typeof LOSS_EXCEPTION_CODES)[number];

type LossCodeParse =
  /** No code supplied — a write-off with no stated kind is never accepted. */
  | { state: 'absent' }
  | { state: 'valid'; code: LossCode }
  /** Present but outside the loss vocabulary (incl. a valid OS&D code). */
  | { state: 'invalid' };

/**
 * Classify the raw body value. Unlike the photo-policy override — where absence is
 * the overwhelmingly common case and therefore not an error — absence here IS an
 * error: the only reason to call this path is to write goods off, and doing that
 * without saying which kind of loss is the thing the vocabulary exists to prevent.
 */
export function parseLossCode(raw: unknown): LossCodeParse {
  if (raw === undefined || raw === null) return { state: 'absent' };
  if (typeof raw !== 'string') return { state: 'invalid' };
  const trimmed = raw.trim();
  if (trimmed === '') return { state: 'absent' };
  // Narrow guard on purpose: `isReceivingExceptionCode` would accept 'SHORT', and
  // an OS&D code must not be usable to write a carton off.
  if (!isLossExceptionCode(trimmed)) return { state: 'invalid' };
  return { state: 'valid', code: trimmed };
}

/** 400 body for a code outside the loss vocabulary — echoes the allowed set. */
export function lossWriteoffInvalidBody(): {
  success: false;
  error: typeof LOSS_WRITEOFF_INVALID_CODE;
  allowed: readonly LossCode[];
} {
  return { success: false, error: LOSS_WRITEOFF_INVALID_CODE, allowed: LOSS_EXCEPTION_CODES };
}

/** Trim + cap an optional operator note; blank becomes null. */
export function normalizeLossNote(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  return trimmed.length > MAX_NOTE_LENGTH
    ? `${trimmed.slice(0, MAX_NOTE_LENGTH - 1)}…`
    : trimmed;
}

/**
 * Canonical "what was written off", assembled from the validated code and the
 * carton's delivery facts. Server-generated by construction.
 */
function lossWriteoffReason(code: LossCode, deliveredAt: string | null): string {
  const label = RECEIVING_EXCEPTION_META[code].label;
  const when = deliveredAt ? ` (carrier delivered ${deliveredAt})` : '';
  const text = `Written off at receiving: ${label}${when}`;
  return text.length > MAX_REASON_LENGTH ? `${text.slice(0, MAX_REASON_LENGTH - 1)}…` : text;
}

interface RecordLossWriteoffInput {
  /** REQUIRED — never defaulted; see the module header. */
  code: LossCode;
  receivingLineId: number;
  receivingId: number | null;
  /** Carrier delivery instant, for the server-assembled reason text. */
  deliveredAt?: string | null;
  /** Optional bounded operator evidence — never the justification. */
  note?: string | null;
  staffId: number | null;
}

interface LossWriteoffDeps {
  recordException: typeof recordReceivingException;
  resolveExceptions: typeof resolveReceivingExceptions;
}

/** Resolve the real writers on first use — see the type-only import above. */
async function realDeps(): Promise<LossWriteoffDeps> {
  const mod = await import('./exceptions');
  return {
    recordException: mod.recordReceivingException,
    resolveExceptions: mod.resolveReceivingExceptions,
  };
}

/**
 * Persist the write-off as ONE open `receiving_exceptions` row. The shared waist
 * emits the `exception_why` entity signal for free; the route audits separately, so
 * the act is never silent even if the signal emitter is degraded.
 */
export async function recordLossWriteoff(
  orgId: OrgId,
  input: RecordLossWriteoffInput,
  deps?: LossWriteoffDeps,
): Promise<{ exceptionId: number }> {
  const d = deps ?? (await realDeps());
  const { id } = await d.recordException(orgId, {
    session: NO_SESSION,
    receivingLineId: input.receivingLineId,
    receivingId: input.receivingId ?? null,
    exceptionCode: input.code,
    reason: lossWriteoffReason(input.code, input.deliveredAt ?? null),
    supportNotes: normalizeLossNote(input.note),
    createdBy: input.staffId ?? null,
  });
  return { exceptionId: id };
}

/**
 * Reopen a written-off line — the carton turned up. Resolves the line's OPEN loss
 * exceptions and returns how many were closed (0 = nothing was written off, which
 * the route maps to 404 so "reopen" is never a silent no-op).
 *
 * Resolves per code rather than passing `exceptionCode: null`: the null form
 * resolves EVERY open exception on the line, which would silently close an
 * unrelated DAMAGED or SHORT finding as a side-effect of reopening.
 */
export async function reopenLossWriteoff(
  orgId: OrgId,
  receivingLineId: number,
  staffId: number | null,
  deps?: LossWriteoffDeps,
): Promise<{ resolved: number }> {
  const d = deps ?? (await realDeps());
  let resolved = 0;
  for (const code of LOSS_EXCEPTION_CODES) {
    resolved += await d.resolveExceptions(
      orgId,
      receivingLineId,
      { exceptionCode: code, resolvedBy: staffId },
    );
  }
  return { resolved };
}
