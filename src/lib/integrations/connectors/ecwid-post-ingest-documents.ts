import type { OrgId } from '@/lib/tenancy/constants';

interface EcwidPostIngestDocumentResult {
  attempted: number;
  fetched: number;
  failed: number;
}

type FetchEcwidPackingSlip = (
  orgId: OrgId,
  orderId: number,
  types: ['packing_slip'],
) => Promise<{ fetched: unknown[]; failed: unknown[] }>;

/** Acquire provider-authored packing slips immediately after an Ecwid ingest. */
export async function fetchEcwidPackingSlipsAfterIngest(
  orgId: OrgId,
  insertedOrderIds: number[],
  fetchDocuments: FetchEcwidPackingSlip,
): Promise<EcwidPostIngestDocumentResult> {
  const orderIds = Array.from(
    new Set(insertedOrderIds.filter((id) => Number.isInteger(id) && id > 0)),
  );

  const outcomes = await Promise.allSettled(
    orderIds.map((orderId) => fetchDocuments(orgId, orderId, ['packing_slip'])),
  );

  return outcomes.reduce<EcwidPostIngestDocumentResult>(
    (summary, outcome) => {
      summary.attempted += 1;
      if (outcome.status === 'rejected') {
        summary.failed += 1;
        return summary;
      }
      summary.fetched += outcome.value.fetched.length;
      summary.failed += outcome.value.failed.length;
      return summary;
    },
    { attempted: 0, fetched: 0, failed: 0 },
  );
}
