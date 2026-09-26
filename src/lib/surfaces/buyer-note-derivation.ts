/** Buyer-note → entity_signals mirror derivation (plan §2.3, external emitter standard — eBay first; Amazon rides the same module later,… */

import { createHash } from 'node:crypto';
import pool from '@/lib/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { isBuyerNoteSignals } from '@/lib/feature-flags';
import { recordEntitySignal, type RecordEntitySignalInput, type RecordEntitySignalResult } from './record-entity-signal';

export interface BuyerNoteCandidateRow {
  id: number;
  buyer_note: string;
  account_source: string | null;
  order_id: string | null;
  order_date: string | null;
  created_at: string | null;
}

export interface DeriveBuyerNoteSignalsDeps {
  isEnabled: (orgId: OrgId) => Promise<boolean>;
  listCandidates: (orgId: OrgId, limit: number) => Promise<BuyerNoteCandidateRow[]>;
  recordSignal: (input: RecordEntitySignalInput) => Promise<RecordEntitySignalResult>;
}

async function listCandidateRows(orgId: OrgId, limit: number): Promise<BuyerNoteCandidateRow[]> {
  // Owner-pool read with an explicit org predicate (read-only; the write side
  // goes through recordEntitySignal → withTenantTransaction).
  const r = await pool.query<BuyerNoteCandidateRow>(
    `SELECT id, buyer_note, account_source, order_id,
            order_date::text AS order_date, created_at::text AS created_at
       FROM orders
      WHERE organization_id = $1
        AND buyer_note IS NOT NULL
        AND btrim(buyer_note) <> ''
      ORDER BY id DESC
      LIMIT $2`,
    [orgId, limit],
  );
  return r.rows;
}

const defaultDeps: DeriveBuyerNoteSignalsDeps = {
  isEnabled: isBuyerNoteSignals,
  listCandidates: listCandidateRows,
  recordSignal: recordEntitySignal,
};

export interface DeriveBuyerNoteSignalsResult {
  enabled: boolean;
  scanned: number;
  emitted: number;
  duplicates: number;
  failed: number;
}

export function buyerNoteSourceRef(orderPk: number, note: string): string {
  const sha16 = createHash('sha256').update(`${orderPk}\n${note}`).digest('hex').slice(0, 16);
  return `ebay-note:${orderPk}:${sha16}`;
}

export async function deriveBuyerNoteSignals(
  orgId: OrgId,
  opts: { limit?: number } = {},
  deps: DeriveBuyerNoteSignalsDeps = defaultDeps,
): Promise<DeriveBuyerNoteSignalsResult> {
  if (!(await deps.isEnabled(orgId))) {
    return { enabled: false, scanned: 0, emitted: 0, duplicates: 0, failed: 0 };
  }

  const limit = Math.max(1, Math.min(opts.limit ?? 500, 10_000));
  const rows = await deps.listCandidates(orgId, limit);

  let emitted = 0;
  let duplicates = 0;
  let failed = 0;

  for (const row of rows) {
    const note = row.buyer_note.trim();
    if (!note) continue;
    try {
      const result = await deps.recordSignal({
        organizationId: orgId,
        entityType: 'ORDER',
        entityId: row.id,
        signalKind: 'buyer_note',
        notes: note,
        occurredAt: row.order_date ?? row.created_at ?? null,
        sourceRef: buyerNoteSourceRef(row.id, note),
        meta: {
          accountSource: row.account_source,
          orderId: row.order_id,
          platform: 'ebay',
        },
      });
      if (!result.ok) failed += 1;
      else if (result.duplicate) duplicates += 1;
      else emitted += 1;
    } catch (err) {
      failed += 1;
      console.warn(`[buyer-note-derivation] signal write failed for order ${row.id} (non-fatal):`, err);
    }
  }

  return { enabled: true, scanned: rows.length, emitted, duplicates, failed };
}
