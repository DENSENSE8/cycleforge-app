/** Pack-ready outbound document ensure (JIT pack documents Phase 4). */

import { after } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  fetchOutboundDocuments,
  listDocumentsForOrder,
  type FetchOutboundDocumentsResult,
} from '@/lib/documents/outbound-documents';
import type { OutboundDocument, OutboundDocumentType } from '@/lib/documents/types';
import { sqlOrderHasPackScan } from '@/lib/orders/order-grain-sql';
import { sqlOrderIsPicked } from '@/lib/picking/picked-by';
import { listSweepOrgIds } from '@/lib/cron/for-each-org';

const BUNDLE_TYPES: OutboundDocumentType[] = ['shipping_label', 'packing_slip'];

interface EnsureOutboundDocsResult {
  orderId: number;
  status: 'complete' | 'partial' | 'missing' | 'noop' | 'skipped_complete';
  hadTypes: OutboundDocumentType[];
  missingBefore: OutboundDocumentType[];
  missingAfter: OutboundDocumentType[];
  fetched: OutboundDocument[];
  failed: FetchOutboundDocumentsResult['failed'];
  source: string;
}

export interface EnsureOutboundDocsDeps {
  listDocumentsForOrder: typeof listDocumentsForOrder;
  fetchOutboundDocuments: typeof fetchOutboundDocuments;
}

const defaultDeps: EnsureOutboundDocsDeps = {
  listDocumentsForOrder,
  fetchOutboundDocuments,
};

function typesPresent(docs: OutboundDocument[]): Set<OutboundDocumentType> {
  const set = new Set<OutboundDocumentType>();
  for (const d of docs) {
    if (BUNDLE_TYPES.includes(d.documentType)) set.add(d.documentType);
  }
  return set;
}

/**
 * Ensure marketplace-fetchable outbound docs exist for a pack-ready order.
 * Idempotent: no-ops when both shipping_label and packing_slip already linked.
 */
export async function ensureOutboundDocsForOrder(
  orgId: OrgId,
  orderId: number,
  opts: { source?: string } = {},
  deps: EnsureOutboundDocsDeps = defaultDeps,
): Promise<EnsureOutboundDocsResult> {
  const source = opts.source ?? 'pack_ready.ensure';
  const existing = await deps.listDocumentsForOrder(orgId, orderId);
  const present = typesPresent(existing);
  const hadTypes = BUNDLE_TYPES.filter((t) => present.has(t));
  const missingBefore = BUNDLE_TYPES.filter((t) => !present.has(t));

  if (missingBefore.length === 0) {
    return {
      orderId,
      status: 'skipped_complete',
      hadTypes,
      missingBefore: [],
      missingAfter: [],
      fetched: [],
      failed: [],
      source,
    };
  }

  const fetchResult = await deps.fetchOutboundDocuments(orgId, orderId, missingBefore);
  const afterDocs = await deps.listDocumentsForOrder(orgId, orderId);
  const presentAfter = typesPresent(afterDocs);
  const missingAfter = BUNDLE_TYPES.filter((t) => !presentAfter.has(t));

  let status: EnsureOutboundDocsResult['status'];
  if (missingAfter.length === 0) status = 'complete';
  else if (fetchResult.fetched.length > 0 || hadTypes.length > 0) status = 'partial';
  else if (fetchResult.failed.length > 0) status = 'missing';
  else status = 'noop';

  return {
    orderId,
    status,
    hadTypes,
    missingBefore,
    missingAfter,
    fetched: fetchResult.fetched,
    failed: fetchResult.failed,
    source,
  };
}

/**
 * Fire-and-forget after the response — keeps pick-scan / add-serial latency short.
 * Falls back to inline void if `after()` is unavailable outside a request.
 */
export function scheduleEnsureOutboundDocsOnPackReady(
  orgId: OrgId,
  orderId: number,
  source: string,
): void {
  if (!Number.isFinite(orderId) || orderId <= 0) return;

  const run = () => {
    void ensureOutboundDocsForOrder(orgId, orderId, { source })
      .then((result) => {
        if (result.status === 'skipped_complete') return;
        console.info(
          '[ensure-outbound-docs]',
          JSON.stringify({
            orgId,
            orderId,
            status: result.status,
            missingBefore: result.missingBefore,
            missingAfter: result.missingAfter,
            fetched: result.fetched.map((d) => d.id),
            failed: result.failed,
            source: result.source,
          }),
        );
      })
      .catch((err) => {
        console.warn('[ensure-outbound-docs] failed', { orgId, orderId, source, err });
      });
  };

  try {
    after(run);
  } catch {
    run();
  }
}

/** Pack-ready (picked), not yet packed, missing at least one outbound doc type. */
async function listPackReadyOrdersMissingOutboundDocs(
  orgId: OrgId,
  limit = 25,
): Promise<number[]> {
  const hasPick = sqlOrderIsPicked('o');
  const hasPack = sqlOrderHasPackScan('o');
  const res = await tenantQuery<{ id: number }>(
    orgId,
    `SELECT o.id
       FROM orders o
      WHERE o.organization_id = $1
        AND ${hasPick}
        AND NOT ${hasPack}
        AND (
          NOT EXISTS (
            SELECT 1
              FROM document_entity_links l
              JOIN documents d ON d.id = l.document_id AND d.organization_id = l.organization_id
             WHERE l.organization_id = o.organization_id
               AND l.entity_type = 'ORDER'
               AND l.entity_id = o.id
               AND d.document_type = 'shipping_label'
          )
          OR NOT EXISTS (
            SELECT 1
              FROM document_entity_links l
              JOIN documents d ON d.id = l.document_id AND d.organization_id = l.organization_id
             WHERE l.organization_id = o.organization_id
               AND l.entity_type = 'ORDER'
               AND l.entity_id = o.id
               AND d.document_type = 'packing_slip'
          )
        )
      ORDER BY o.id ASC
      LIMIT $2`,
    [orgId, limit],
  );
  return res.rows.map((r) => Number(r.id));
}

interface EnsureOutboundDocsBatchSummary {
  orgs: number;
  candidates: number;
  ensured: number;
  complete: number;
  partial: number;
  missing: number;
  skipped: number;
  errors: number;
}

export async function runEnsureOutboundDocsBatch(
  limitPerOrg = 25,
): Promise<EnsureOutboundDocsBatchSummary> {
  const orgIds = await listSweepOrgIds();
  const summary: EnsureOutboundDocsBatchSummary = {
    orgs: orgIds.length,
    candidates: 0,
    ensured: 0,
    complete: 0,
    partial: 0,
    missing: 0,
    skipped: 0,
    errors: 0,
  };

  for (const orgId of orgIds) {
    let orderIds: number[] = [];
    try {
      orderIds = await listPackReadyOrdersMissingOutboundDocs(orgId, limitPerOrg);
    } catch (err) {
      summary.errors += 1;
      console.error('[ensure-outbound-docs] list failed', orgId, err);
      continue;
    }
    summary.candidates += orderIds.length;

    for (const orderId of orderIds) {
      try {
        const result = await ensureOutboundDocsForOrder(orgId, orderId, {
          source: 'cron.documents.ensure_outbound',
        });
        summary.ensured += 1;
        if (result.status === 'complete') summary.complete += 1;
        else if (result.status === 'partial') summary.partial += 1;
        else if (result.status === 'skipped_complete') summary.skipped += 1;
        else summary.missing += 1;
      } catch (err) {
        summary.errors += 1;
        console.error('[ensure-outbound-docs] ensure failed', orgId, orderId, err);
      }
    }
  }

  return summary;
}
