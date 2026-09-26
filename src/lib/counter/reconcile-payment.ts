/** Close the loop between a Square payment and the counter visit that staged it. */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import type { CounterTransactionStatus } from './counter-transaction-types';

export interface StagedHeader {
  id: number;
  status: CounterTransactionStatus;
  /** What the visit was staged at, in cents. */
  totalCents: number;
}

export interface ReconcileCounterPaymentDeps {
  /** The counter header that staged this provider order, if any. */
  findHeaderByStagedOrder(orgId: OrgId, squareOrderId: string): Promise<StagedHeader | null>;
  /** Stamp the link onto the already-written `square_transactions` row. */
  linkSquareTransaction(orgId: OrgId, squareOrderId: string, headerId: number): Promise<void>;
  patchHeaderStatus(orgId: OrgId, headerId: number, status: CounterTransactionStatus): Promise<void>;
}

type ReconcileResult =
  | {
      linked: true;
      counterTransactionId: number;
      status: CounterTransactionStatus;
      /** True when the header was already settled — nothing was rewritten. */
      idempotent: boolean;
    }
  | { linked: false; reason: 'no_staged_header' | 'no_order_id' };

/** Which status a payment of `paidCents` puts a visit staged at `totalCents` in. */
export function statusForPayment(
  paidCents: number,
  totalCents: number,
): CounterTransactionStatus {
  if (paidCents <= 0) return 'staged';
  if (totalCents <= 0) return 'paid';
  return paidCents >= totalCents ? 'paid' : 'partially_paid';
}

const defaultDeps: ReconcileCounterPaymentDeps = {
  async findHeaderByStagedOrder(orgId, squareOrderId) {
    const res = await tenantQuery<{ id: string; status: string; total_cents: number }>(
      orgId,
      `SELECT id, status, total_cents
         FROM counter_transactions
        WHERE organization_id = $1 AND staged_square_order_id = $2
        LIMIT 1`,
      [orgId, squareOrderId],
    );
    const row = res.rows[0];
    return row
      ? {
          id: Number(row.id),
          status: row.status as CounterTransactionStatus,
          totalCents: Number(row.total_cents ?? 0),
        }
      : null;
  },

  async linkSquareTransaction(orgId, squareOrderId, headerId) {
    await withTenantTransaction(orgId, async (client) => {
      await client.query(
        `UPDATE square_transactions
            SET counter_transaction_id = $3
          WHERE organization_id = $1 AND square_order_id = $2
            AND counter_transaction_id IS DISTINCT FROM $3`,
        [orgId, squareOrderId, headerId],
      );
    });
  },

  async patchHeaderStatus(orgId, headerId, status) {
    await withTenantTransaction(orgId, async (client) => {
      await client.query(
        `UPDATE counter_transactions
            SET status = $3, updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [orgId, headerId, status],
      );
    });
  },
};

/** Link a completed Square payment to its counter visit and settle the header. */
export async function reconcileCounterPayment(
  orgId: OrgId,
  args: { squareOrderId: string | null | undefined; paidCents: number },
  deps: ReconcileCounterPaymentDeps = defaultDeps,
): Promise<ReconcileResult> {
  const squareOrderId = String(args.squareOrderId ?? '').trim();
  if (!squareOrderId) return { linked: false, reason: 'no_order_id' };

  const header = await deps.findHeaderByStagedOrder(orgId, squareOrderId);
  // A sale rung up directly on the stand has no counter visit. Normal, not an error.
  if (!header) return { linked: false, reason: 'no_staged_header' };

  // The link is idempotent on its own (the UPDATE is a no-op when it already
  // points here), so it runs on every delivery — that also repairs a row that
  // was written before this reader existed.
  await deps.linkSquareTransaction(orgId, squareOrderId, header.id);

  // Never walk a settled visit backwards: Square can redeliver, and it can
  // deliver a partial payment's event after the one that completed the sale.
  if (header.status === 'paid') {
    return { linked: true, counterTransactionId: header.id, status: 'paid', idempotent: true };
  }

  const next = statusForPayment(args.paidCents, header.totalCents);
  if (next === header.status) {
    return {
      linked: true,
      counterTransactionId: header.id,
      status: header.status,
      idempotent: true,
    };
  }

  await deps.patchHeaderStatus(orgId, header.id, next);
  return { linked: true, counterTransactionId: header.id, status: next, idempotent: false };
}
