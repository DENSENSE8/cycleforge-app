/**
 * Tag an Incoming spine row as a RETURN intake — desk Add / CSV path.
 * Sets line receiving_type + receiving_line_return facts. Carton flags are
 * updated only when the line already has a receiving_id (pre-arrival lines
 * stay line-scoped until a carton soft-joins).
 */

import { withTenantTransaction, tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { upsertReceivingLineReturn } from '@/lib/receiving/facts/narrow';
import { returnPlatformForSource } from '@/lib/receiving/return-platform-for-source';

interface TagInboundReturnInput {
  receivingLineId: number;
  /** Inbound source slug (amazon / ebay / manual / …) → return_platform. */
  sourceType: string;
  sourceOrderId?: string | null;
  returnReason?: string | null;
  rmaRef?: string | null;
  /** Override return_platform enum when the operator picks one explicitly. */
  returnPlatform?: string | null;
}

export async function tagInboundAsReturn(
  orgId: OrgId,
  input: TagInboundReturnInput,
): Promise<void> {
  const receivingLineId = Number(input.receivingLineId);
  if (!Number.isFinite(receivingLineId) || receivingLineId <= 0) {
    throw new Error('inbound: receivingLineId is required');
  }

  const returnPlatform =
    (input.returnPlatform?.trim() || null) ??
    returnPlatformForSource(input.sourceType) ??
    null;

  await withTenantTransaction(orgId, async (client) => {
    const q = {
      query: ((_o: OrgId, sql: string, p?: unknown[]) =>
        client.query(sql, p)) as typeof tenantQuery,
    };

    await client.query(
      `UPDATE receiving_line
          SET receiving_type = 'RETURN',
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2::uuid`,
      [receivingLineId, orgId],
    );

    await upsertReceivingLineReturn(
      orgId,
      receivingLineId,
      {
        returnPlatform,
        returnReason: input.returnReason?.trim() || null,
        sourceOrderId: input.sourceOrderId?.trim() || null,
        rmaRef: input.rmaRef?.trim() || null,
      },
      q,
    );

    const line = await client.query<{ receiving_id: number | null }>(
      `SELECT receiving_id FROM receiving_line
        WHERE id = $1 AND organization_id = $2::uuid`,
      [receivingLineId, orgId],
    );
    const cartonId = line.rows[0]?.receiving_id;
    if (cartonId != null) {
      const inboundSource =
        input.sourceType === 'ebay' || input.sourceType === 'amazon' || input.sourceType === 'manual'
          ? input.sourceType
          : null;
      await client.query(
        `UPDATE receiving_carton
            SET intake_type = 'RETURN',
                is_return = true,
                return_platform = COALESCE($3, return_platform),
                source = CASE
                  WHEN source = 'unmatched' AND $4::text IS NOT NULL THEN $4
                  ELSE source
                END,
                source_platform = COALESCE(source_platform, $5),
                updated_at = NOW()
          WHERE id = $1 AND organization_id = $2::uuid`,
        [
          cartonId,
          orgId,
          returnPlatform,
          inboundSource,
          inboundSource === 'amazon' || inboundSource === 'ebay' ? inboundSource : null,
        ],
      );
    }
  });
}
