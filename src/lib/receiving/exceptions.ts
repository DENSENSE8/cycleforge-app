/** Receiving line-level exception domain — the decomposition home for per-line exception facts that used to be stuck at carton level on the… */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { emitEntitySignalSafe } from '@/lib/surfaces/record-entity-signal';
import { claimTypeExceptionCode, type ClaimType } from '@/lib/receiving-claim-type';
import { CLAIM_EXCEPTION_CODES, INVESTIGATION_EXCEPTION_CODES } from './exception-codes';

interface ReceivingExceptionRow {
  id: number;
  receiving_line_id: number | null;
  receiving_id: number | null;
  exception_code: string;
  reason: string | null;
  support_notes: string | null;
  zendesk_ticket: string | null;
  status: string;
  created_by: number | null;
  created_at: string;
}

interface RecordReceivingExceptionInput {
  /** Null = a carton-level exception (a lineless unfound carton); then `receivingId` is required. */
  receivingLineId: number | null;
  receivingId?: number | null;
  exceptionCode: string;
  reason?: string | null;
  supportNotes?: string | null;
  zendeskTicket?: string | null;
  createdBy?: number | null;
}

export interface ReceivingExceptionsDeps {
  query: typeof tenantQuery;
  /** Optional so pre-existing fakes stay valid; defaults to the real emitter. */
  emitSignal?: typeof emitEntitySignalSafe;
}

const defaultDeps: ReceivingExceptionsDeps = { query: tenantQuery, emitSignal: emitEntitySignalSafe };

/** Record one OPEN line-level exception. */
export async function recordReceivingException(
  orgId: OrgId,
  input: RecordReceivingExceptionInput,
  deps: ReceivingExceptionsDeps = defaultDeps,
): Promise<{ id: number }> {
  const r = await deps.query<{ id: number }>(
    orgId,
    `INSERT INTO receiving_exceptions
       (organization_id, receiving_line_id, receiving_id, exception_code, reason, support_notes, zendesk_ticket, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      orgId,
      input.receivingLineId,
      input.receivingId ?? null,
      input.exceptionCode,
      input.reason ?? null,
      input.supportNotes ?? null,
      input.zendeskTicket ?? null,
      input.createdBy ?? null,
    ],
  );
  const id = r.rows[0].id;

  // Additive "why" signal (plan §2.3 emitter #2, line-level OS&D). Never
  // fails the exception write — emitEntitySignalSafe swallows all errors.
  await (deps.emitSignal ?? emitEntitySignalSafe)({
    organizationId: orgId,
    entityType: input.receivingLineId != null ? 'RECEIVING_LINE' : 'RECEIVING',
    entityId: input.receivingLineId ?? Number(input.receivingId),
    signalKind: 'exception_why',
    reasonCode: input.exceptionCode,
    notes: input.reason ?? null,
    actorStaffId: input.createdBy ?? null,
    meta: { receivingId: input.receivingId ?? null, receivingExceptionId: id },
  });

  return { id };
}

/** All exceptions for a line, newest-first (for the Unbox/History detail panes). */
export async function listReceivingLineExceptions(
  orgId: OrgId,
  receivingLineId: number,
  deps: ReceivingExceptionsDeps = defaultDeps,
): Promise<ReceivingExceptionRow[]> {
  const r = await deps.query<ReceivingExceptionRow>(
    orgId,
    `SELECT id, receiving_line_id, receiving_id, exception_code, reason,
            support_notes, zendesk_ticket, status, created_by, created_at::text AS created_at
       FROM receiving_exceptions
      WHERE organization_id = $1 AND receiving_line_id = $2
      ORDER BY created_at DESC, id DESC`,
    [orgId, receivingLineId],
  );
  return r.rows;
}

/** Mark a line's open exceptions of a given code (or all) RESOLVED. */
export async function resolveReceivingExceptions(
  orgId: OrgId,
  receivingLineId: number,
  opts: { exceptionCode?: string | null; resolvedBy?: number | null } = {},
  deps: ReceivingExceptionsDeps = defaultDeps,
): Promise<number> {
  const r = await deps.query<{ id: number }>(
    orgId,
    `UPDATE receiving_exceptions
        SET status = 'RESOLVED', resolved_by = $3, resolved_at = NOW(), updated_at = NOW()
      WHERE organization_id = $1
        AND receiving_line_id = $2
        AND status = 'OPEN'
        AND ($4::text IS NULL OR exception_code = $4)
      RETURNING id`,
    [orgId, receivingLineId, opts.resolvedBy ?? null, opts.exceptionCode ?? null],
  );
  return r.rows.length;
}

/**
 * The ticket's scope: the line it was filed on, else the carton (a line-level
 * row never answers for a carton-level ticket, or the reverse).
 */
const TICKET_SCOPE_SQL = `organization_id = $1
        AND zendesk_ticket = $2
        AND status = 'OPEN'
        AND CASE WHEN $3::int IS NOT NULL THEN receiving_line_id = $3::int
                 ELSE receiving_line_id IS NULL AND receiving_id = $4::int END`;

function ticketLabel(ticket: string): string {
  const t = ticket.trim();
  return t.startsWith('#') ? t : `#${t}`;
}

/**
 * Record WHY a ticket was filed from a carton (owner 2026-09-28: every ticket
 * says whether it is an investigation or a claim). The ONE writer for the
 * claim wizard's create and link paths: maps the claim type to its exception
 * code ({@link claimTypeExceptionCode}) and keeps exactly one OPEN row per
 * ticket + scope — a re-file under another type re-codes it; a type that
 * records no reason closes it. Returns the recorded code (null = none).
 */
export async function recordTicketReason(
  orgId: OrgId,
  input: {
    receivingId: number;
    lineId: number | null;
    claimType: ClaimType;
    ticketNumber: string;
    staffId: number | null;
  },
  deps: ReceivingExceptionsDeps = defaultDeps,
): Promise<string | null> {
  const ticket = ticketLabel(input.ticketNumber);
  const lineId = input.lineId != null && input.lineId > 0 ? input.lineId : null;
  const carton = await deps.query<{ has_order: boolean }>(
    orgId,
    `SELECT (NULLIF(TRIM(zoho_purchaseorder_id), '') IS NOT NULL
             OR NULLIF(TRIM(zoho_purchaseorder_number), '') IS NOT NULL
             OR NULLIF(TRIM(source_order_id), '') IS NOT NULL) AS has_order
       FROM receiving_carton
      WHERE organization_id = $1 AND id = $2`,
    [orgId, input.receivingId],
  );
  const code = claimTypeExceptionCode(input.claimType, { hasOrder: carton.rows[0]?.has_order === true });
  const scopeParams = [orgId, ticket, lineId, input.receivingId];
  if (code == null) {
    await deps.query(
      orgId,
      `UPDATE receiving_exceptions
          SET status = 'RESOLVED', resolved_by = $5, resolved_at = NOW(), updated_at = NOW()
        WHERE ${TICKET_SCOPE_SQL}`,
      [...scopeParams, input.staffId],
    );
    return null;
  }
  const recoded = await deps.query<{ id: number }>(
    orgId,
    `UPDATE receiving_exceptions
        SET exception_code = $5, updated_at = NOW()
      WHERE ${TICKET_SCOPE_SQL}
      RETURNING id`,
    [...scopeParams, code],
  );
  if (recoded.rows.length === 0) {
    await recordReceivingException(
      orgId,
      {
        receivingLineId: lineId,
        receivingId: input.receivingId,
        exceptionCode: code,
        zendeskTicket: ticket,
        createdBy: input.staffId,
      },
      deps,
    );
  }
  return code;
}

/** Close the reason a ticket recorded on this line / carton — the ticket was unlinked. */
export async function resolveTicketReason(
  orgId: OrgId,
  input: { receivingId: number; lineId: number | null; ticketNumber: string; resolvedBy: number | null },
  deps: ReceivingExceptionsDeps = defaultDeps,
): Promise<number> {
  const lineId = input.lineId != null && input.lineId > 0 ? input.lineId : null;
  const r = await deps.query<{ id: number }>(
    orgId,
    `UPDATE receiving_exceptions
        SET status = 'RESOLVED', resolved_by = $5, resolved_at = NOW(), updated_at = NOW()
      WHERE ${TICKET_SCOPE_SQL}
      RETURNING id`,
    [orgId, ticketLabel(input.ticketNumber), lineId, input.receivingId, input.resolvedBy],
  );
  return r.rows.length;
}

/**
 * The carton was paired to a PO / order: every open investigation on it (its
 * own row or any of its lines') is answered.
 */
export async function resolveCartonInvestigations(
  orgId: OrgId,
  receivingId: number,
  resolvedBy: number | null,
  deps: ReceivingExceptionsDeps = defaultDeps,
): Promise<number> {
  const r = await deps.query<{ id: number }>(
    orgId,
    `UPDATE receiving_exceptions rx
        SET status = 'RESOLVED', resolved_by = $3, resolved_at = NOW(), updated_at = NOW()
      WHERE rx.organization_id = $1
        AND rx.status = 'OPEN'
        AND rx.exception_code = ANY($4::text[])
        AND (rx.receiving_id = $2
             OR rx.receiving_line_id IN (
                  SELECT rl.id FROM receiving_line rl
                   WHERE rl.organization_id = $1 AND rl.receiving_id = $2))
      RETURNING rx.id`,
    [orgId, receivingId, resolvedBy, [...INVESTIGATION_EXCEPTION_CODES]],
  );
  return r.rows.length;
}

/**
 * The claim a ticket recorded on this carton is settled: every OPEN
 * claim-family reason with that ticket, on the carton's own row or any of its
 * lines, is RESOLVED (the ticket stays linked — it is the claim's paper trail).
 */
export async function resolveCartonClaim(
  orgId: OrgId,
  input: { receivingId: number; ticketNumber: string; resolvedBy: number | null },
  deps: ReceivingExceptionsDeps = defaultDeps,
): Promise<number> {
  const r = await deps.query<{ id: number }>(
    orgId,
    `UPDATE receiving_exceptions rx
        SET status = 'RESOLVED', resolved_by = $3, resolved_at = NOW(), updated_at = NOW()
      WHERE rx.organization_id = $1
        AND rx.status = 'OPEN'
        AND rx.zendesk_ticket = $4
        AND rx.exception_code = ANY($5::text[])
        AND (rx.receiving_id = $2
             OR rx.receiving_line_id IN (
                  SELECT rl.id FROM receiving_line rl
                   WHERE rl.organization_id = $1 AND rl.receiving_id = $2))
      RETURNING rx.id`,
    [orgId, input.receivingId, input.resolvedBy, ticketLabel(input.ticketNumber), [...CLAIM_EXCEPTION_CODES]],
  );
  return r.rows.length;
}
