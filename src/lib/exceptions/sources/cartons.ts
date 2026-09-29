/**
 * Received cartons that need a person — Claim · Short · Unfound — in ONE
 * carton-level statement over the Unboxed ledger's population:
 *
 * - lined cartons: the `view=activity` line predicate (`build-sql.ts`: a
 *   received / unboxed line whose carton was opened or unboxed on the Unbox
 *   surface), folded to the carton;
 * - lineless cartons: the History placeholder predicate (`unmatched` /
 *   `local_pickup`, no line, Unbox-touched) — always Unfound.
 *
 * The flags are `dockedFlags`' rules in SQL (Unfound: an unmatched carton's
 * line with no PO, or a lineless placeholder; Claim: an OPEN claim-family
 * reason with a filed ticket on the line or its carton; Short: received <
 * expected). A carton sits in ONE kind — its most urgent flag, Unfound ›
 * Claim › Short ({@link cartonExceptionKind}), the one its card face paints.
 * `list` and `count` read the same statement.
 */

import { CLAIM_EXCEPTION_CODES, receivingExceptionLabel } from '@/lib/receiving/exception-codes';
import { buildReceivingLinesByReceivingIdSql } from '@/lib/receiving/lines/build-sql';
import { buildUnmatchedEmptyReceivingLine, normalizeRow } from '@/lib/receiving/lines/normalize-row';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { CartonExceptionFacts } from '../facts';
import { isoOrNull, memoized, positiveIntId, text, type ExceptionSource, type ExceptionSourceContext } from '../source';
import { exceptionRowKey, type ExceptionRow } from '../types';

export type CartonExceptionKind = CartonExceptionFacts['kind'];

/** One carton's attention flags. */
export interface CartonFlags {
  unfound: boolean;
  claim: boolean;
  short: boolean;
}

/** The carton's ONE kind: its most urgent flag (pill order), else none. */
export function cartonExceptionKind(flags: CartonFlags): CartonExceptionKind | null {
  if (flags.unfound) return 'unfound';
  if (flags.claim) return 'claim';
  if (flags.short) return 'short';
  return null;
}

export interface ExceptionCartonRow extends CartonFlags {
  receiving_id: number | string;
  lineless: boolean;
  po_number: string | null;
  zoho_purchaseorder_id: string | null;
  tracking: string | null;
  carrier: string | null;
  source: string | null;
  title: string | null;
  received: number | string | null;
  expected: number | string | null;
  unboxed_at: Date | string | null;
  created_at: Date | string | null;
  claims: Array<{ code: string; ticket: string }> | null;
}

const CLAIM_CODES_SQL = CLAIM_EXCEPTION_CODES.map((code) => `'${code}'`).join(',');

/** An OPEN claim-family reason with a filed ticket on `lineSql` or its carton. */
function openClaimSql(lineSql: string, cartonSql: string): string {
  return `rx.organization_id = $1
        AND rx.status = 'OPEN'
        AND rx.exception_code IN (${CLAIM_CODES_SQL})
        AND NULLIF(TRIM(COALESCE(rx.zendesk_ticket, '')), '') IS NOT NULL
        AND (rx.receiving_line_id = ${lineSql} OR (rx.receiving_line_id IS NULL AND rx.receiving_id = ${cartonSql}))`;
}

const CARTON_EXCEPTIONS_SQL = `
  WITH act AS (
    SELECT rl.id, rl.receiving_id, rl.quantity_received, rl.quantity_expected, rl.item_name,
           r.source, rz.zoho_purchaseorder_id, ru.unboxed_at, sc.product_title
      FROM receiving_line rl
      JOIN receiving_carton r ON r.id = rl.receiving_id AND r.organization_id = rl.organization_id
      LEFT JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
      LEFT JOIN receiving_unbox ru ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
      LEFT JOIN sku_catalog sc ON sc.sku = rl.sku AND sc.organization_id = rl.organization_id
     WHERE rl.organization_id = $1
       AND (rl.workflow_status IN ('UNBOXED','AWAITING_TEST','IN_TEST','PASSED','DONE')
            OR COALESCE(rl.quantity_received, 0) > 0
            OR ru.unboxed_at IS NOT NULL)
       AND (ru.unboxed_at IS NOT NULL OR ru.opened_at IS NOT NULL)
  ),
  lined AS (
    SELECT a.receiving_id,
           false AS lineless,
           bool_or(a.source = 'unmatched' AND NULLIF(TRIM(COALESCE(a.zoho_purchaseorder_id, '')), '') IS NULL) AS unfound,
           bool_or(EXISTS (SELECT 1 FROM receiving_exceptions rx WHERE ${openClaimSql('a.id', 'a.receiving_id')})) AS claim,
           bool_or(a.quantity_expected IS NOT NULL AND COALESCE(a.quantity_received, 0) < a.quantity_expected) AS short,
           MAX(NULLIF(TRIM(COALESCE(a.zoho_purchaseorder_id, '')), '')) AS zoho_purchaseorder_id,
           (ARRAY_AGG(COALESCE(NULLIF(TRIM(a.product_title), ''), NULLIF(TRIM(a.item_name), '')) ORDER BY a.id)
              FILTER (WHERE COALESCE(NULLIF(TRIM(a.product_title), ''), NULLIF(TRIM(a.item_name), '')) IS NOT NULL))[1] AS title,
           SUM(COALESCE(a.quantity_received, 0)) AS received,
           SUM(COALESCE(a.quantity_expected, 0)) AS expected,
           MAX(a.unboxed_at) AS unboxed_at
      FROM act a
     GROUP BY a.receiving_id
  ),
  lineless AS (
    SELECT r.id AS receiving_id, true AS lineless, true AS unfound, false AS claim, false AS short,
           NULL::text AS zoho_purchaseorder_id, NULL::text AS title, 0 AS received, 0 AS expected, ru.unboxed_at
      FROM receiving_carton r
      LEFT JOIN receiving_unbox ru ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
     WHERE r.organization_id = $1
       AND r.source IN ('unmatched', 'local_pickup')
       AND NOT EXISTS (SELECT 1 FROM receiving_line rl WHERE rl.receiving_id = r.id AND rl.organization_id = r.organization_id)
       AND (ru.unboxed_at IS NOT NULL
            OR ru.opened_at IS NOT NULL
            OR EXISTS (SELECT 1 FROM ops_events oe
                        WHERE oe.organization_id = r.organization_id
                          AND oe.entity_type = 'receiving'
                          AND oe.entity_id = r.id
                          AND oe.event_type = 'UNBOX_SCAN_OPENED'))
  ),
  flagged AS (
    SELECT * FROM lined WHERE unfound OR claim OR short
    UNION ALL
    SELECT * FROM lineless
  )
  SELECT f.receiving_id, f.lineless, f.unfound, f.claim, f.short, f.title, f.received, f.expected, f.unboxed_at,
         COALESCE(f.zoho_purchaseorder_id, NULLIF(TRIM(COALESCE(r.zoho_purchaseorder_id, '')), '')) AS zoho_purchaseorder_id,
         NULLIF(TRIM(COALESCE(r.zoho_purchaseorder_number, '')), '') AS po_number,
         NULLIF(TRIM(COALESCE(stn.tracking_number_raw, '')), '') AS tracking,
         COALESCE(NULLIF(TRIM(COALESCE(r.carrier, '')), ''), stn.carrier) AS carrier,
         r.source, r.created_at,
         CASE WHEN f.claim AND NOT f.unfound THEN (
           SELECT jsonb_agg(DISTINCT jsonb_build_object('code', rx.exception_code, 'ticket', TRIM(rx.zendesk_ticket)))
             FROM receiving_exceptions rx
            WHERE rx.organization_id = $1
              AND rx.status = 'OPEN'
              AND rx.exception_code IN (${CLAIM_CODES_SQL})
              AND NULLIF(TRIM(COALESCE(rx.zendesk_ticket, '')), '') IS NOT NULL
              AND (rx.receiving_id = f.receiving_id
                   OR rx.receiving_line_id IN (SELECT a.id FROM act a WHERE a.receiving_id = f.receiving_id))
         ) END AS claims
    FROM flagged f
    JOIN receiving_carton r ON r.id = f.receiving_id AND r.organization_id = $1
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id`;

/** Every flagged carton, loaded once per request (and joined across concurrent reads) for all three kinds. */
function loadExceptionCartons(ctx: ExceptionSourceContext): Promise<ExceptionCartonRow[]> {
  return memoized(ctx, 'receiving:exception-cartons', async () =>
    (await tenantQueryOneTrip<ExceptionCartonRow>(ctx.orgId, CARTON_EXCEPTIONS_SQL, [ctx.orgId])).rows);
}

/** One ticket per claim, labelled by its reason. */
function cartonClaims(row: ExceptionCartonRow): CartonExceptionFacts['claims'] {
  const byTicket = new Map<string, { code: string; label: string; ticket: string }>();
  for (const claim of row.claims ?? []) {
    if (!byTicket.has(claim.ticket)) {
      byTicket.set(claim.ticket, { code: claim.code, label: receivingExceptionLabel(claim.code), ticket: claim.ticket });
    }
  }
  return [...byTicket.values()];
}

export function cartonRow(row: ExceptionCartonRow, kind: CartonExceptionKind): ExceptionRow {
  const sourceId = String(row.receiving_id);
  const poNumber = text(row.po_number);
  const tracking = text(row.tracking);
  let tag: ExceptionRow['tag'];
  let detail: string | null;
  let resolveVerb: string;
  if (kind === 'unfound') {
    tag = { label: 'Unfound', tone: 'danger' };
    detail = [tracking, text(row.carrier)].filter(Boolean).join(' · ') || null;
    resolveVerb = 'Match PO';
  } else if (kind === 'claim') {
    const claims = cartonClaims(row);
    const first = claims[0];
    // An unspecified claim's reason label IS "Claim" — never "Claim · Claim".
    tag = { label: first && first.label !== 'Claim' ? `Claim · ${first.label}` : 'Claim', tone: 'warning' };
    detail = claims.map((c) => c.ticket).join(', ') || null;
    resolveVerb = 'Settle claim';
  } else {
    tag = { label: 'Short', tone: 'warning' };
    detail = `Received ${Number(row.received) || 0} of ${Number(row.expected) || 0}`;
    resolveVerb = 'File claim';
  }
  return {
    key: exceptionRowKey(kind, sourceId),
    kind,
    domain: 'receiving',
    sourceId,
    tag,
    entity: poNumber
      ? { type: 'po', id: sourceId, label: `PO ${poNumber}` }
      : { type: 'carton', id: sourceId, label: tracking ?? `Carton #${sourceId}` },
    title: text(row.title),
    detail,
    order: null,
    resolveVerb,
    raisedAt: isoOrNull(row.unboxed_at) ?? isoOrNull(row.created_at),
  };
}

/** The carton's lines for the resolver: every line, or the lineless placeholder (`id < 0`). */
async function cartonLines(ctx: ExceptionSourceContext, row: ExceptionCartonRow): Promise<ReceivingLineRow[]> {
  const receivingId = Number(row.receiving_id);
  if (row.lineless) {
    return [
      normalizeRow(
        buildUnmatchedEmptyReceivingLine({
          id: receivingId,
          receiving_tracking_number: row.tracking,
          carrier: row.carrier,
          receiving_source: row.source,
          receiving_zoho_purchaseorder_number: row.po_number,
          receiving_unboxed_at: row.unboxed_at == null ? null : String(isoOrNull(row.unboxed_at)),
          created_at: row.created_at == null ? null : String(isoOrNull(row.created_at)),
        }),
      ) as unknown as ReceivingLineRow,
    ];
  }
  const { lines } = buildReceivingLinesByReceivingIdSql(receivingId, ctx.orgId);
  const res = await tenantQueryOneTrip(ctx.orgId, lines.sql, lines.params);
  return res.rows.map((line) => normalizeRow(line) as unknown as ReceivingLineRow);
}

/** One carton kind over a flagged-carton loader (the carton statement by default). */
export function cartonSource(
  kind: CartonExceptionKind,
  load: (ctx: ExceptionSourceContext) => Promise<ExceptionCartonRow[]> = loadExceptionCartons,
): ExceptionSource<CartonExceptionFacts> {
  const members = async (ctx: ExceptionSourceContext) => (await load(ctx)).filter((row) => cartonExceptionKind(row) === kind);
  return {
    kind,
    list: async (ctx) => (await members(ctx)).map((row) => cartonRow(row, kind)),
    count: async (ctx) => (await members(ctx)).length,
    async record(ctx, sourceId) {
      const receivingId = positiveIntId(sourceId);
      if (receivingId == null) return null;
      const row = (await members(ctx)).find((c) => Number(c.receiving_id) === receivingId);
      if (!row) return null;
      return {
        row: cartonRow(row, kind),
        facts: {
          kind,
          carton: {
            receivingId,
            poNumber: text(row.po_number),
            zohoPurchaseorderId: text(row.zoho_purchaseorder_id),
            tracking: text(row.tracking),
            carrier: text(row.carrier),
            source: text(row.source),
            unboxedAt: isoOrNull(row.unboxed_at),
          },
          lines: await cartonLines(ctx, row),
          claims: kind === 'claim' ? cartonClaims(row) : [],
        },
      };
    },
  };
}

export const claimSource = cartonSource('claim');
export const shortSource = cartonSource('short');
export const unfoundSource = cartonSource('unfound');
