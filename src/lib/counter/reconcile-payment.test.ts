/** node --require ./scripts/register-server-only-shim.cjs --import tsx \ --test src/lib/counter/reconcile-payment.test.ts */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  reconcileCounterPayment,
  statusForPayment,
  type ReconcileCounterPaymentDeps,
  type StagedHeader,
} from './reconcile-payment';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;
const ORDER = 'sq-order-1';

interface Fake {
  deps: ReconcileCounterPaymentDeps;
  header: StagedHeader | null;
  links: Array<{ squareOrderId: string; headerId: number }>;
  statuses: Array<{ headerId: number; status: string }>;
}

function fakes(header: StagedHeader | null): Fake {
  const f: Fake = { header, links: [], statuses: [], deps: null as never };
  f.deps = {
    async findHeaderByStagedOrder(_orgId, squareOrderId) {
      return squareOrderId === ORDER ? f.header : null;
    },
    async linkSquareTransaction(_orgId, squareOrderId, headerId) {
      f.links.push({ squareOrderId, headerId });
    },
    async patchHeaderStatus(_orgId, headerId, status) {
      f.statuses.push({ headerId, status });
    },
  };
  return f;
}

function staged(overrides: Partial<StagedHeader> = {}): StagedHeader {
  return { id: 42, status: 'staged', totalCents: 5000, ...overrides };
}

describe('statusForPayment', () => {
  it('settles at or above the staged total — tips and terminal tax make > routine', () => {
    assert.equal(statusForPayment(5000, 5000), 'paid');
    assert.equal(statusForPayment(6000, 5000), 'paid');
  });

  it('calls a short payment partially_paid — a deposit is a real counter state', () => {
    assert.equal(statusForPayment(2000, 5000), 'partially_paid');
  });

  it('leaves a zero payment staged', () => {
    assert.equal(statusForPayment(0, 5000), 'staged');
    assert.equal(statusForPayment(-1, 5000), 'staged');
  });

  it('treats any payment against a zero-total visit as settled', () => {
    assert.equal(statusForPayment(100, 0), 'paid');
  });
});

describe('reconcileCounterPayment', () => {
  it('links the row and settles the header', async () => {
    const f = fakes(staged());
    const result = await reconcileCounterPayment(ORG, { squareOrderId: ORDER, paidCents: 5000 }, f.deps);

    assert.equal(result.linked, true);
    assert.equal(result.linked && result.counterTransactionId, 42);
    assert.equal(result.linked && result.status, 'paid');
    assert.equal(result.linked && result.idempotent, false);
    assert.deepEqual(f.links, [{ squareOrderId: ORDER, headerId: 42 }]);
    assert.deepEqual(f.statuses, [{ headerId: 42, status: 'paid' }]);
  });

  it('records a short payment as partially_paid', async () => {
    const f = fakes(staged());
    const result = await reconcileCounterPayment(ORG, { squareOrderId: ORDER, paidCents: 2000 }, f.deps);
    assert.equal(result.linked && result.status, 'partially_paid');
    assert.deepEqual(f.statuses, [{ headerId: 42, status: 'partially_paid' }]);
  });

  it('NEVER walks a settled visit backwards on a redelivered partial', async () => {
    // Square redelivers, and can deliver a partial payment's event AFTER the
    // one that completed the sale. This is the assertion that keeps a paid
    // visit paid.
    const f = fakes(staged({ status: 'paid' }));
    const result = await reconcileCounterPayment(ORG, { squareOrderId: ORDER, paidCents: 2000 }, f.deps);

    assert.equal(result.linked && result.status, 'paid');
    assert.equal(result.linked && result.idempotent, true);
    assert.deepEqual(f.statuses, [], 'no status write at all');
  });

  it('is idempotent on an exact replay — links again, rewrites nothing', async () => {
    const f = fakes(staged({ status: 'paid' }));
    await reconcileCounterPayment(ORG, { squareOrderId: ORDER, paidCents: 5000 }, f.deps);
    await reconcileCounterPayment(ORG, { squareOrderId: ORDER, paidCents: 5000 }, f.deps);

    assert.equal(f.statuses.length, 0);
    // The link runs every time on purpose: the UPDATE is a no-op when it
    // already points here, and it repairs rows written before this reader existed.
    assert.equal(f.links.length, 2);
  });

  it('does not rewrite a status that already matches', async () => {
    const f = fakes(staged({ status: 'partially_paid' }));
    const result = await reconcileCounterPayment(ORG, { squareOrderId: ORDER, paidCents: 2000 }, f.deps);
    assert.equal(result.linked && result.idempotent, true);
    assert.deepEqual(f.statuses, []);
  });

  it('a sale rung up on the stand has no counter visit — that is normal, not an error', async () => {
    const f = fakes(null);
    const result = await reconcileCounterPayment(ORG, { squareOrderId: 'sq-walkin', paidCents: 5000 }, f.deps);

    assert.equal(result.linked, false);
    assert.equal(!result.linked && result.reason, 'no_staged_header');
    assert.deepEqual(f.links, [], 'nothing linked');
    assert.deepEqual(f.statuses, []);
  });

  it('refuses an empty order id without touching anything', async () => {
    const f = fakes(staged());
    for (const id of [null, undefined, '', '   ']) {
      const result = await reconcileCounterPayment(ORG, { squareOrderId: id, paidCents: 5000 }, f.deps);
      assert.equal(!result.linked && result.reason, 'no_order_id');
    }
    assert.deepEqual(f.links, []);
  });

  it('links even when the payment does not settle it — the visit is still ours', async () => {
    const f = fakes(staged());
    await reconcileCounterPayment(ORG, { squareOrderId: ORDER, paidCents: 0 }, f.deps);
    assert.deepEqual(f.links, [{ squareOrderId: ORDER, headerId: 42 }]);
    assert.deepEqual(f.statuses, [], 'zero payment leaves it staged');
  });
});
