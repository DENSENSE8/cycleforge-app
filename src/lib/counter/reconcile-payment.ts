/**
 * Close the loop between a Square payment and the counter visit that staged it.
 *
 * ### The gap this fills
 *
 * `counter_transactions.staged_square_order_id` exists for exactly one purpose,
 * stated in its own migration: the kiosk STAGES an order and never charges
 * (plan D4), so the `square_transactions` row is created later by the payment
 * webhook — which knows only the provider order id. Without a lookup from that
 * id back to the header, `square_transactions.counter_transaction_id` can never
 * be filled and **a paid visit never reconciles**.
 *
 * The column shipped. The reader did not: as of 2026-08-21 the only references
 * to `staged_square_order_id` in the tree were the writer and its tests. So
 * every counter sale sat at `staged` forever while the money was in the bank.
 *
 * ### Why a domain module and not four lines in the webhook
 *
 * The webhook is a session-less callback that already carries the tenant
 * resolution, the order fetch and the realtime publish. Reconciliation is a
 * decision with rules — partial payment, replay, an order that is not ours —
 * and rules that live inside a `try` block in a webhook are rules nobody can
 * test. `Deps` is injectable so all of them are exercised with zero DB.
 *
 * ### What it must never do
 *
 * **Never move a header OUT of `paid`.** Square redelivers webhooks, and it can
 * deliver a partial payment's event after the completing one. A naive
 * "set status from this payment's amount" would walk a settled visit backwards
 * to `partially_paid` on a redelivery.
 *
 * **Never fail the webhook.** An unknown order is the normal case — a walk-in
 * sale rung up directly on the Square stand has no counter header and must
 * still write its `square_transactions` row. That is `no_staged_header`, not an
 * error.
 *
 * Plan: `docs/todo/counter-square-enterprise-PLAN.md` (SQ1).
 */

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

export type ReconcileResult =
  | {
      linked: true;
      counterTransactionId: number;
      status: CounterTransactionStatus;
      /** True when the header was already settled — nothing was rewritten. */
      idempotent: boolean;
    }
  | { linked: false; reason: 'no_staged_header' | 'no_order_id' };

/**
 * Which status a payment of `paidCents` puts a visit staged at `totalCents` in.
 *
 * Pure and exported because this is the rule anyone will argue about later, and
 * an argument is easier to settle against a test than against a SQL statement.
 *
 * A payment at or above the staged total settles it. Tips and tax collected at
 * the terminal make `paid > staged` routine, so this is `>=`, never `===`.
 * Anything above zero but short is `partially_paid` — a real state at a counter
 * (a deposit, a split tender), not an error.
 */
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

/**
 * Link a completed Square payment to its counter visit and settle the header.
 *
 * Best-effort by contract: every refusal is a `linked: false` result, never a
 * throw, because the caller is a webhook whose other work (writing the
 * `square_transactions` row, publishing the sale event) must not be undone by
 * a visit that happens not to exist.
 */
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
