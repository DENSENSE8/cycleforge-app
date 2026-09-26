import pool from '@/lib/db';
import { conditionLabel } from '@/components/receiving/zoho-po-types';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { getOrgPlatforms, getOrgTypes } from '@/lib/catalog/org-catalog';
import { resolveClaimSubjectIdentity } from '@/lib/zendesk-claim-subject-identity';
import { buildClaimSubject, type ClaimSubjectParts } from '@/lib/zendesk-claim-subject';
import {
  CLAIM_TYPE_LABEL,
  type ClaimSeverity,
  type ClaimType,
} from '@/lib/receiving-claim-type';

export type {
  ClaimType,
  ClaimSeverity,
} from '@/lib/receiving-claim-type';
export { CLAIM_TYPE_LABEL } from '@/lib/receiving-claim-type';
export { buildClaimSubject, type ClaimSubjectParts } from '@/lib/zendesk-claim-subject';

const CLAIM_SEVERITY_LABEL: Record<ClaimSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

/** Render an unboxing timestamp in the shop's local time for the ticket body. */
function formatUnboxedAt(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

interface ClaimTemplateInput {
  receivingId: number;
  lineId?: number | null;
  claimType: ClaimType;
  reason?: string;
  /** "View the PO receiving" link to embed in the body (built from req origin). */
  poReceivingLink?: string;
  /** Marketplace product URL captured during inbound intake. */
  listingUrl?: string;
}

interface ClaimTemplateResult {
  subject: string;
  description: string;
  /**
   * The parts `subject` was composed from. The claim modal keeps these and
   * re-renders the title on every reclassify — one composer, no drift.
   */
  subjectParts: ClaimSubjectParts;
  /** Real PO# when present (in the title), else null. Drives ticket filenames. */
  poNumber: string | null;
  /** Raw tracking number for the carton, or null. */
  tracking: string | null;
}

/**
 * Zendesk attachment stem for claim photos — PO# first, then tracking, then
 * the receiving id. Shared by Create and Link & send so filenames match.
 */
export function claimAttachmentFileLabel(
  input: Pick<ClaimTemplateResult, 'poNumber' | 'tracking'>,
  receivingId: number,
): string {
  return (
    input.poNumber
      ? `PO-${input.poNumber}`
      : input.tracking
        ? `TRK-${input.tracking}`
        : `RCV-${receivingId}`
  ).replace(/[^A-Za-z0-9._-]+/g, '-');
}

export async function buildReceivingClaimTemplate(
  input: ClaimTemplateInput,
  orgId?: OrgId,
): Promise<ClaimTemplateResult> {
  const { receivingId, lineId, claimType, reason, poReceivingLink, listingUrl } = input;

  // When orgId is present, scope the read to the tenant:
  const recvSql = orgId
    ? `SELECT r.id,
            r.source_platform,
            r.intake_type,
            r.is_return,
            r.return_platform::text AS return_platform,
            ru.unboxed_at,
            su.name AS unboxed_by_name,
            s.tracking_number_raw AS tracking_number,
            COALESCE(rz.zoho_purchaseorder_number, r.zoho_purchaseorder_number) AS zoho_purchaseorder_number,
            COALESCE(rz.zoho_purchaseorder_id, r.zoho_purchaseorder_id) AS zoho_purchaseorder_id,
            COALESCE(rl.source_order_id, r.source_order_id) AS source_order_id,
            rl.receiving_type
     FROM receiving_carton r
     LEFT JOIN receiving_unbox ru
            ON ru.receiving_id = r.id
           AND ru.organization_id = r.organization_id
     LEFT JOIN shipping_tracking_numbers s ON s.id = r.shipment_id
     LEFT JOIN staff su ON su.id = ru.unboxed_by AND su.organization_id = r.organization_id
     LEFT JOIN receiving_line rl
            ON rl.receiving_id = r.id
           AND rl.organization_id = r.organization_id
           AND ($2::int IS NULL OR rl.id = $2)
     LEFT JOIN receiving_line_zoho rz
            ON rz.receiving_line_id = rl.id
           AND rz.organization_id = rl.organization_id
     WHERE r.id = $1
       AND r.organization_id = $3
     ORDER BY rl.id NULLS LAST
     LIMIT 1`
    : `SELECT r.id,
            r.source_platform,
            r.intake_type,
            r.is_return,
            r.return_platform::text AS return_platform,
            ru.unboxed_at,
            su.name AS unboxed_by_name,
            s.tracking_number_raw AS tracking_number,
            COALESCE(rz.zoho_purchaseorder_number, r.zoho_purchaseorder_number) AS zoho_purchaseorder_number,
            COALESCE(rz.zoho_purchaseorder_id, r.zoho_purchaseorder_id) AS zoho_purchaseorder_id,
            COALESCE(rl.source_order_id, r.source_order_id) AS source_order_id,
            rl.receiving_type
     FROM receiving_carton r
     LEFT JOIN receiving_unbox ru ON ru.receiving_id = r.id
     LEFT JOIN shipping_tracking_numbers s ON s.id = r.shipment_id
     LEFT JOIN staff su ON su.id = ru.unboxed_by
     LEFT JOIN receiving_line rl
            ON rl.receiving_id = r.id
           AND ($2::int IS NULL OR rl.id = $2)
     LEFT JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
     WHERE r.id = $1
     ORDER BY rl.id NULLS LAST
     LIMIT 1`;
  const recvResult = orgId
    ? await tenantQuery(orgId, recvSql, [receivingId, lineId ?? null, orgId])
    : await pool.query(recvSql, [receivingId, lineId ?? null]);
  const carton = recvResult.rows[0] as
    | {
        id: number;
        source_platform: string | null;
        intake_type: string | null;
        is_return: boolean | null;
        return_platform: string | null;
        unboxed_at: string | Date | null;
        unboxed_by_name: string | null;
        tracking_number: string | null;
        zoho_purchaseorder_number: string | null;
        zoho_purchaseorder_id: string | null;
        source_order_id: string | null;
        receiving_type: string | null;
      }
    | undefined;
  if (!carton) throw new Error('Receiving not found');

  // Serials scanned against the carton/line during unboxing. serial_units is the
  // master the receiving pipeline writes to. Best-effort — a serial-read hiccup
  // must never block filing a claim. Scope to the line when one is given.
  let serials: string[] = [];
  try {
    // Receiving serials live in two stores, both keyed to the line:
    const serialSql = orgId
      ? `WITH lines AS (
           SELECT id FROM receiving_line WHERE receiving_id = $1 AND organization_id = $3
         )
         SELECT DISTINCT serial_number FROM (
           SELECT BTRIM(tsn.serial_number) AS serial_number
             FROM tech_serial_numbers tsn
            WHERE tsn.station_source = 'RECEIVING'
              AND tsn.organization_id = $3
              AND tsn.receiving_line_id IN (SELECT id FROM lines)
              AND ($2::int IS NULL OR tsn.receiving_line_id = $2)
           UNION
           SELECT BTRIM(su.serial_number) AS serial_number
             FROM serial_units su
            WHERE su.organization_id = $3
              AND su.id IN (SELECT p.serial_unit_id FROM serial_unit_provenance p
                             WHERE p.origin_type = 'RECEIVING_LINE' AND p.organization_id = $3
                               AND p.origin_id IN (SELECT id FROM lines)
                               AND ($2::int IS NULL OR p.origin_id = $2))
         ) s
         WHERE BTRIM(COALESCE(serial_number, '')) <> ''
         ORDER BY serial_number
         LIMIT 50`
      : `WITH lines AS (
           SELECT id FROM receiving_line WHERE receiving_id = $1
         )
         SELECT DISTINCT serial_number FROM (
           SELECT BTRIM(tsn.serial_number) AS serial_number
             FROM tech_serial_numbers tsn
            WHERE tsn.station_source = 'RECEIVING'
              AND tsn.receiving_line_id IN (SELECT id FROM lines)
              AND ($2::int IS NULL OR tsn.receiving_line_id = $2)
           UNION
           SELECT BTRIM(su.serial_number) AS serial_number
             FROM serial_units su
            WHERE su.id IN (SELECT p.serial_unit_id FROM serial_unit_provenance p
                             WHERE p.origin_type = 'RECEIVING_LINE'
                               AND p.origin_id IN (SELECT id FROM lines)
                               AND ($2::int IS NULL OR p.origin_id = $2))
         ) s
         WHERE BTRIM(COALESCE(serial_number, '')) <> ''
         ORDER BY serial_number
         LIMIT 50`;
    const serialRes = orgId
      ? await tenantQuery(orgId, serialSql, [receivingId, lineId ?? null, orgId])
      : await pool.query(serialSql, [receivingId, lineId ?? null]);
    serials = serialRes.rows
      .map((r: { serial_number: string | null }) => String(r.serial_number ?? '').trim())
      .filter(Boolean);
  } catch (err) {
    console.warn('[zendesk-claim-template] serial lookup failed', err);
  }

  let lineSummary = '';
  if (lineId) {
    const lineSql = orgId
      ? `SELECT rl.item_name, rl.sku, rl.quantity_received, rl.quantity_expected, rlt.condition_grade
       FROM receiving_line rl
       LEFT JOIN receiving_line_testing rlt ON rlt.receiving_line_id = rl.id AND rlt.organization_id = rl.organization_id
       WHERE rl.id = $1 AND rl.organization_id = $2 LIMIT 1`
      : `SELECT rl.item_name, rl.sku, rl.quantity_received, rl.quantity_expected, rlt.condition_grade
       FROM receiving_line rl
       LEFT JOIN receiving_line_testing rlt ON rlt.receiving_line_id = rl.id AND rlt.organization_id = rl.organization_id
       WHERE rl.id = $1 LIMIT 1`;
    const lineResult = orgId
      ? await tenantQuery(orgId, lineSql, [lineId, orgId])
      : await pool.query(lineSql, [lineId]);
    const line = lineResult.rows[0] as
      | {
          item_name: string | null;
          sku: string | null;
          quantity_received: number;
          quantity_expected: number | null;
          condition_grade: string | null;
        }
      | undefined;
    if (line) {
      const title = line.item_name || line.sku || `Line #${lineId}`;
      const qtyText = line.quantity_expected != null
        ? `received ${line.quantity_received} of ${line.quantity_expected}`
        : `received ${line.quantity_received}`;
      const condText = line.condition_grade
        ? conditionLabel(line.condition_grade)
        : 'not yet graded';
      lineSummary = `Item: ${title} — ${condText}, ${qtyText}`;
    }
  }

  // Unfound flow:
  const poNumber = carton.zoho_purchaseorder_number || carton.zoho_purchaseorder_id;
  const orderId = (carton.source_order_id || '').trim();
  const hasPo = !!poNumber;
  const hasOrderId = !hasPo && orderId.length > 0;
  const poRef = hasPo ? (poNumber as string) : hasOrderId ? orderId : 'Unfound PO';
  const trackingRef = carton.tracking_number || 'n/a';
  // Not routed through effectiveIntakeKind (the line-vs-carton-default SoT, src/lib/receiving/kinds/registry.ts):
  const effectiveReceivingType = (carton.receiving_type || carton.intake_type || 'PO').trim().toUpperCase();
  // Org catalog labels win (renamed / custom platforms + types) — same contract
  // as classify pills and printed carton labels. Built-ins remain the fallback.
  let catalogPlatformLabel: string | null = null;
  let catalogTypeLabel: string | null = null;
  if (orgId) {
    const platformKey = String(carton.source_platform ?? '').trim().toLowerCase();
    const typeKey = effectiveReceivingType;
    const [platforms, types] = await Promise.all([getOrgPlatforms(orgId), getOrgTypes(orgId)]);
    if (platformKey) {
      catalogPlatformLabel = platforms.find((p) => p.slug.toLowerCase() === platformKey)?.label ?? null;
    }
    if (typeKey) {
      catalogTypeLabel = types.find((t) => t.slug.toUpperCase() === typeKey)?.label ?? null;
    }
  }
  const subjectPlatform = resolveClaimSubjectIdentity({
    sourcePlatform: carton.source_platform,
    receivingType: effectiveReceivingType,
    isReturn: carton.is_return,
    returnPlatform: carton.return_platform,
    claimTypeLabel: CLAIM_TYPE_LABEL[claimType],
    catalogPlatformLabel,
    catalogTypeLabel,
  });
  // The title is composed by `buildClaimSubject` and NOWHERE else — the modal re-renders it from these same parts when the operator…
  const subjectParts: ClaimSubjectParts = {
    identity: subjectPlatform,
    claimTypeLabel: CLAIM_TYPE_LABEL[claimType],
    poNumber: hasPo ? poRef : null,
    orderId: hasOrderId ? poRef : null,
    tracking: carton.tracking_number || null,
  };
  const subject = buildClaimSubject(subjectParts);

  const unboxedByName = String(carton.unboxed_by_name ?? '').trim();
  const unboxedAtText = formatUnboxedAt(carton.unboxed_at);

  const trimmedReason = String(reason ?? '').trim();
  // Tracking AND the PO# are omitted from the body when they're already in the
  // subject (TRK#… and // PO …). For unfound cartons (no PO in the title) we
  // still note the missing PO so the agent sees it.
  const descriptionLines: string[] = [
    `Issue: ${CLAIM_TYPE_LABEL[claimType]}`,
    ...(hasPo || hasOrderId ? [] : [`Purchase Order: ${poRef}`]),
    ...(lineSummary ? [lineSummary] : hasPo ? [`Scope: package-wide (no specific item)`] : []),
  ];
  if (serials.length) {
    descriptionLines.push(`Serial${serials.length > 1 ? 's' : ''}: ${serials.join(', ')}`);
  }
  if (unboxedByName && unboxedAtText) {
    descriptionLines.push(`Unboxed by: ${unboxedByName} · ${unboxedAtText}`);
  } else if (unboxedByName) {
    descriptionLines.push(`Unboxed by: ${unboxedByName}`);
  } else if (unboxedAtText) {
    descriptionLines.push(`Unboxed: ${unboxedAtText}`);
  }
  descriptionLines.push('');
  const trimmedListingUrl = String(listingUrl ?? '').trim();
  if (trimmedListingUrl) {
    descriptionLines.push(`Listing: ${trimmedListingUrl}`);
  }
  // Photos ride along as real Zendesk attachments (uploaded at submit from the
  // operator's selection) — no boilerplate line about them in the body. A link
  // back to the carton's receiving workspace gives the agent full context.
  if (poReceivingLink) {
    descriptionLines.push(`View the receiving record: ${poReceivingLink}`);
  }
  if (trimmedReason) {
    descriptionLines.push('', 'Claim reason:', trimmedReason, '');
  }

  return {
    subject,
    subjectParts,
    description: descriptionLines.join('\n'),
    poNumber: hasPo ? poRef : null,
    tracking: carton.tracking_number || null,
  };
}

/** Render a plaintext claim/ticket body as Zendesk-safe HTML for `comment.html_body`: */
export function claimBodyToHtml(text: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const urlRe = /(https?:\/\/[^\s<]+)/g;

  const lines = String(text ?? '').split('\n').map((line) => {
    // Linkify URLs first (against the escaped line), then bold a leading "Label:".
    let html = escape(line).replace(
      urlRe,
      (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`,
    );
    html = html.replace(/^([A-Za-z][\w /-]{0,40}:)(\s)/, '<strong>$1</strong>$2');
    return html;
  });

  return lines.join('<br>');
}
