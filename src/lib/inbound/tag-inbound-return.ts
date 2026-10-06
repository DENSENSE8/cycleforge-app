/**
 * The RETURN facts of one landed inbound line, written on the writer's
 * transaction (`ingestInboundOrderInTx`) so the triage form, the CSV import
 * and a marketplace sync all land them the same way: the line's
 * `receiving_line_return` row (platform, reason, order, RMA and the return
 * report's unit identity) and, once the line sits on a carton, the carton's
 * return classifiers the inspector paints.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import type { tenantQuery } from '@/lib/tenancy/db';
import { upsertReceivingLineReturn } from '@/lib/receiving/facts/narrow';
import { returnPlatformForSource } from '@/lib/receiving/return-platform-for-source';
import type { TxClient } from './purchase-links';

export interface InboundReturnFacts {
  receivingLineId: number;
  /** Inbound source slug (amazon / ebay / manual / …) → return_platform. */
  sourceType: string;
  sourceOrderId: string;
  /** `undefined` leaves the stored value (a machine landing that carries none). */
  returnReason?: string | null;
  rmaRef?: string | null;
  /** Unit identity from a return report; `undefined` leaves the stored value. */
  fnsku?: string | null;
  licensePlateNumber?: string | null;
  disposition?: string | null;
  customerComment?: string | null;
  /** YYYY-MM-DD. */
  returnRequestedOn?: string | null;
}

export async function tagInboundReturnInTx(client: TxClient, orgId: OrgId, input: InboundReturnFacts): Promise<void> {
  const returnPlatform = returnPlatformForSource(input.sourceType);
  const reason = input.returnReason?.trim() || null;
  const rma = input.rmaRef?.trim() || null;

  await upsertReceivingLineReturn(
    orgId,
    input.receivingLineId,
    {
      returnPlatform,
      returnReason: input.returnReason === undefined ? undefined : reason,
      sourceOrderId: input.sourceOrderId.trim() || null,
      rmaRef: input.rmaRef === undefined ? undefined : rma,
      fnsku: input.fnsku,
      licensePlateNumber: input.licensePlateNumber,
      disposition: input.disposition,
      customerComment: input.customerComment,
      returnRequestedOn: input.returnRequestedOn,
    },
    { query: ((_o: OrgId, sql: string, p?: unknown[]) => client.query(sql, p)) as typeof tenantQuery },
  );

  // The writer's lines already carry receiving_type = draft.type; a bare door line (QA fixture) gains it here.
  const line = await client.query<{ receiving_id: number | null }>(
    `UPDATE receiving_line
        SET receiving_type = 'RETURN',
            updated_at = CASE WHEN receiving_type IS DISTINCT FROM 'RETURN' THEN NOW() ELSE updated_at END
      WHERE id = $1 AND organization_id = $2::uuid
      RETURNING receiving_id`,
    [input.receivingLineId, orgId],
  );
  const cartonId = line.rows[0]?.receiving_id;
  if (cartonId == null) return;

  const inboundSource =
    input.sourceType === 'ebay' || input.sourceType === 'amazon' || input.sourceType === 'manual' ? input.sourceType : null;
  // Carton inspector paints `return_reason` — keep RMA visible when reason is blank.
  const cartonReason = reason && rma ? `${reason} · RMA ${rma}` : reason || (rma ? `RMA ${rma}` : null);
  await client.query(
    `UPDATE receiving_carton
        SET intake_type = 'RETURN',
            is_return = true,
            return_platform = COALESCE($3, return_platform),
            return_reason = COALESCE($6, return_reason),
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
      cartonReason,
    ],
  );
}
