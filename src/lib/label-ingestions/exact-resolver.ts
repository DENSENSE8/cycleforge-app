import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import type { ExactOrderIdentity, LabelQuarantineReasonCode, ParsedLabelEvidence } from './types';

interface ExactResolution { exactOrder: ExactOrderIdentity | null; orderIds: number[]; quarantineReason: LabelQuarantineReasonCode | null; }

/** No address, customer, tracking, partial, regexp, LIKE, or cross-account resolution occurs here. */
export async function resolveExactLabelOrder(client: Pick<PoolClient, 'query'>, organizationId: OrgId, evidence: ParsedLabelEvidence): Promise<ExactResolution> {
  if (evidence.multiPackageEvidence) return { exactOrder: null, orderIds: [], quarantineReason: 'MULTI_PACKAGE_EVIDENCE' };
  if (!evidence.trackingNumberNormalized) return { exactOrder: null, orderIds: [], quarantineReason: 'TRACKING_ONLY' };
  if (!evidence.carrier) return { exactOrder: null, orderIds: [], quarantineReason: 'UNSUPPORTED_CARRIER' };
  const candidate = evidence.cycleforgeReference ?? evidence.marketplaceOrderId;
  if (!candidate) return { exactOrder: null, orderIds: [], quarantineReason: 'TRACKING_ONLY' };
  if (!evidence.accountSource) return { exactOrder: null, orderIds: [], quarantineReason: evidence.cycleforgeReference ? 'CYCLEFORGE_REFERENCE_UNMAPPED' : 'MISSING_ACCOUNT_CONTEXT' };
  const matchMethod = evidence.cycleforgeReference ? 'CYCLEFORGE_REFERENCE' as const : 'MARKETPLACE_ORDER_ID' as const;
  const rows = await client.query<{ id: number | string }>(`SELECT id FROM orders WHERE organization_id = $1 AND account_source = $2 AND order_id = $3 ORDER BY id ASC`, [organizationId, evidence.accountSource, candidate]);
  if (!rows.rows.length) return { exactOrder: null, orderIds: [], quarantineReason: 'ORDER_NOT_FOUND' };
  return { exactOrder: { accountSource: evidence.accountSource, marketplaceOrderId: candidate, matchMethod, cycleforgeReference: evidence.cycleforgeReference }, orderIds: rows.rows.map((row) => Number(row.id)), quarantineReason: null };
}
