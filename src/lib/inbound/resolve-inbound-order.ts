/** Door / Unbox order# → marketplace / manual Incoming carton. */

import type { OrgId } from '@/lib/tenancy/constants';
import type { ensureReceivingForInboundOrder as EnsureReceivingFn } from '@/lib/receiving/attach-box';
import type { tenantQuery as TenantQuery } from '@/lib/tenancy/db';
import type { withTenantTransaction as WithTx } from '@/lib/tenancy/db';

type InboundOrderHit = {
  receivingId: number;
  receivingLineId: number;
  sourceType: 'ebay' | 'amazon' | 'manual';
  sourceOrderId: string;
  /** True when we minted the carton on this lookup. */
  createdCarton: boolean;
};

export interface ResolveInboundOrderDeps {
  query: typeof TenantQuery;
  withTx: typeof WithTx;
  ensureReceivingForInboundOrder: typeof EnsureReceivingFn;
}

const defaultDeps: ResolveInboundOrderDeps = {
  query: async (orgId, sql, params) => {
    const { tenantQuery } = await import('@/lib/tenancy/db');
    return tenantQuery(orgId, sql, params);
  },
  withTx: async (orgId, fn) => {
    const { withTenantTransaction } = await import('@/lib/tenancy/db');
    return withTenantTransaction(orgId, fn);
  },
  ensureReceivingForInboundOrder: async (params) => {
    const { ensureReceivingForInboundOrder } = await import('@/lib/receiving/attach-box');
    return ensureReceivingForInboundOrder(params);
  },
};

function normalizeOrderKey(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Exact (normalized) match on link source_order_id or mirror order_number.
 * Ambiguous (≥2 distinct primary orders) → null.
 */
export async function resolveInboundCartonByOrderId(
  orgId: OrgId,
  orderNumber: string,
  deps: ResolveInboundOrderDeps = defaultDeps,
): Promise<InboundOrderHit | null> {
  const norm = normalizeOrderKey(orderNumber);
  if (!norm) return null;

  const r = await deps.query<{
    receiving_id: number | null;
    receiving_line_id: number;
    source_type: string;
    source_order_id: string;
  }>(
    orgId,
    `SELECT rl.receiving_id,
            rl.id AS receiving_line_id,
            l.source_type,
            l.source_order_id
       FROM inbound_purchase_order_links l
       JOIN receiving_line rl
         ON rl.id = l.receiving_line_id
        AND rl.organization_id = l.organization_id
       LEFT JOIN inbound_purchase_order_mirror m
         ON m.organization_id = l.organization_id
        AND m.source_type = l.source_type
        AND m.source_order_id = l.source_order_id
      WHERE l.organization_id = $1::uuid
        AND l.is_primary = true
        AND l.source_type IN ('ebay', 'amazon', 'manual')
        AND (
              NULLIF(upper(regexp_replace(l.source_order_id, '[^A-Za-z0-9]', '', 'g')), '') = $2
           OR NULLIF(upper(regexp_replace(COALESCE(m.order_number, ''), '[^A-Za-z0-9]', '', 'g')), '') = $2
            )
      ORDER BY rl.id DESC
      LIMIT 4`,
    [orgId, norm],
  );

  if (r.rows.length === 0) return null;

  // Collapse to unique (source_type, source_order_id); ambiguous → miss.
  const keys = new Set(
    r.rows.map((row) => `${row.source_type}\0${row.source_order_id}`),
  );
  if (keys.size !== 1) return null;

  const row = r.rows[0]!;
  const sourceType = row.source_type as 'ebay' | 'amazon' | 'manual';
  const sourceOrderId = String(row.source_order_id);
  const receivingLineId = Number(row.receiving_line_id);

  if (row.receiving_id != null) {
    return {
      receivingId: Number(row.receiving_id),
      receivingLineId,
      sourceType,
      sourceOrderId,
      createdCarton: false,
    };
  }

  // EXPECTED line with no carton yet — mint one and stamp the line.
  const receivingId = await deps.withTx(orgId, async (client) => {
    const cartonId = await deps.ensureReceivingForInboundOrder({
      sourceType,
      sourceOrderId,
      organizationId: orgId,
      db: client as unknown as {
        query: typeof client.query;
      },
    });
    await client.query(
      `UPDATE receiving_line
          SET receiving_id = $2,
              updated_at = NOW()
        WHERE organization_id = $1::uuid
          AND source_order_id = $3
          AND COALESCE(inbound_source_type, '') = $4
          AND receiving_id IS NULL`,
      [orgId, cartonId, sourceOrderId, sourceType],
    );
    // Also stamp any sibling lines sharing the same primary link order.
    await client.query(
      `UPDATE receiving_line rl
          SET receiving_id = $2,
              updated_at = NOW()
         FROM inbound_purchase_order_links l
        WHERE l.organization_id = $1::uuid
          AND l.source_type = $4
          AND l.source_order_id = $3
          AND l.receiving_line_id = rl.id
          AND rl.organization_id = $1::uuid
          AND rl.receiving_id IS NULL`,
      [orgId, cartonId, sourceOrderId, sourceType],
    );
    return cartonId;
  });

  return {
    receivingId,
    receivingLineId,
    sourceType,
    sourceOrderId,
    createdCarton: true,
  };
}
