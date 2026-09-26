import 'server-only';
import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';

/** The order's ONE live shipping label (Outbound Triage either/or rule). */
export interface LiveOrderLabel {
  live: boolean;
  documentId: number | null;
  source: string | null;
  tracking: string | null;
  carrier: string | null;
  shipstationLabelId: string | null;
  shipmentId: number | null;
}

/** `document_data.source` of a label bought by hand on a marketplace and uploaded. */
export const MARKETPLACE_MANUAL_LABEL_SOURCE = 'marketplace_manual';
/** `document_data.source` of a label bought through ShipStation v2. */
export const SHIPSTATION_LABEL_SOURCE = 'shipstation_api';

/** Ids of every document attached to an order: */
export function orderDocumentIdsSql(orderIdExpr: string, orgIdExpr: string): string {
  return `SELECT de.id FROM documents de
             WHERE de.entity_type IN ('ORDER', 'SHIPPING_LABEL') AND de.entity_id = ${orderIdExpr}
           UNION ALL
           SELECT l.document_id FROM document_entity_links l
             WHERE l.organization_id = ${orgIdExpr} AND l.entity_type = 'ORDER' AND l.entity_id = ${orderIdExpr}`;
}

/** LEFT JOIN LATERAL fragment resolving an order row's live label. */
export function liveLabelLateralSql(orderAlias: string): string {
  const o = orderAlias;
  return `LEFT JOIN LATERAL (
    SELECT
      (lbl_doc.id IS NOT NULL OR ${o}.shipment_id IS NOT NULL) AS live_label_live,
      lbl_doc.id AS live_label_document_id,
      COALESCE(
        CASE
          WHEN lbl_doc.id IS NULL THEN NULL
          WHEN lbl_doc.document_data->>'source' = '${MARKETPLACE_MANUAL_LABEL_SOURCE}'
               AND NULLIF(lbl_doc.document_data->>'platform', '') IS NOT NULL
            THEN '${MARKETPLACE_MANUAL_LABEL_SOURCE}:' || (lbl_doc.document_data->>'platform')
          ELSE NULLIF(lbl_doc.document_data->>'source', '')
        END,
        NULLIF(lbl_stn.metadata->>'labelSource', '')
      ) AS live_label_source,
      COALESCE(lbl_stn.tracking_number_raw, NULLIF(lbl_doc.document_data->>'tracking', '')) AS live_label_tracking,
      COALESCE(NULLIF(lbl_stn.carrier, ''), NULLIF(lbl_doc.document_data->>'carrier', '')) AS live_label_carrier,
      NULLIF(lbl_stn.metadata->>'labelId', '') AS live_label_shipstation_label_id,
      ${o}.shipment_id AS live_label_shipment_id
    FROM (SELECT 1) lbl_one
    LEFT JOIN LATERAL (
      SELECT d.id, d.document_data
        FROM documents d
       WHERE d.organization_id = ${o}.organization_id
         AND d.document_type = 'shipping_label'
         AND d.id IN (${orderDocumentIdsSql(`${o}.id`, `${o}.organization_id`)})
       ORDER BY d.created_at DESC, d.id DESC
       LIMIT 1
    ) lbl_doc ON TRUE
    LEFT JOIN shipping_tracking_numbers lbl_stn
      ON lbl_stn.id = ${o}.shipment_id
     AND lbl_stn.organization_id = ${o}.organization_id
  ) live_label ON TRUE`;
}

type LiveLabelRow = {
  live_label_live: boolean;
  live_label_document_id: number | string | null;
  live_label_source: string | null;
  live_label_tracking: string | null;
  live_label_carrier: string | null;
  live_label_shipstation_label_id: string | null;
  live_label_shipment_id: number | string | null;
};

const LIVE_LABEL_SQL = `SELECT live_label.*
     FROM orders o
     ${liveLabelLateralSql('o')}
    WHERE o.id = $1 AND o.organization_id = $2
    LIMIT 1`;

function toId(value: number | string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Map one lateral row (see liveLabelLateralSql) to the public shape. */
export function mapLiveLabelRow(row: LiveLabelRow | undefined): LiveOrderLabel {
  if (!row) {
    return { live: false, documentId: null, source: null, tracking: null, carrier: null, shipstationLabelId: null, shipmentId: null };
  }
  return {
    live: row.live_label_live === true,
    documentId: toId(row.live_label_document_id),
    source: row.live_label_source ?? null,
    tracking: row.live_label_tracking ?? null,
    carrier: row.live_label_carrier ?? null,
    shipstationLabelId: row.live_label_shipstation_label_id ?? null,
    shipmentId: toId(row.live_label_shipment_id),
  };
}

/**
 * Read the order's live label. Returns `null` when the order does not exist in
 * this org (callers 404); otherwise the label state (`live: false` = none).
 * Pass `client` to read inside a caller-owned tenant transaction.
 */
export async function readLiveOrderLabel(
  orgId: OrgId,
  orderId: number,
  client?: Pick<PoolClient, 'query'>,
): Promise<LiveOrderLabel | null> {
  const params = [orderId, orgId];
  const res = client
    ? await client.query<LiveLabelRow>(LIVE_LABEL_SQL, params)
    : await tenantQuery<LiveLabelRow>(orgId, LIVE_LABEL_SQL, params);
  if (res.rows.length === 0) return null;
  return mapLiveLabelRow(res.rows[0]);
}

/** The `label` payload of a `409 LABEL_EXISTS` response. */
export function liveLabelConflictBody(label: LiveOrderLabel) {
  return {
    error: 'LABEL_EXISTS' as const,
    label: {
      documentId: label.documentId,
      source: label.source,
      tracking: label.tracking,
      carrier: label.carrier,
      shipstationLabelId: label.shipstationLabelId,
    },
  };
}
