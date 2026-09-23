/**
 *   node --require ./scripts/register-server-only-shim.cjs --import tsx \
 *     --test src/lib/counter/read-visit.test.ts
 *
 * DB-free. Every Deps method is a fake keyed off fixtures registered by
 * `fakes()`, so these assert the JOIN SHAPE `loadCounterVisit` assembles —
 * not any particular SQL — and that org isolation and the no-N+1 contract
 * hold at the call-count level.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  loadCounterVisit,
  type CounterVisitAuditEntry,
  type CounterVisitCustomer,
  type CounterVisitDevice,
  type CounterVisitLine,
  type CounterVisitSquareTransaction,
  type ReadVisitDeps,
} from './read-visit';
import type { CounterTransactionStatus } from './counter-transaction-types';
import type { CounterPaymentState } from './session-events';

const ORG = '00000000-0000-4000-8000-000000000001' as OrgId;
const OTHER_ORG = '00000000-0000-4000-8000-000000000002' as OrgId;

interface SessionFixture {
  sessionId: number;
  claimedByStaffId: number | null;
  claimedByStaffName: string | null;
  paymentState: CounterPaymentState;
  lines?: CounterVisitLine[];
  auditTrail?: CounterVisitAuditEntry[];
}

interface VisitFixture {
  orgId: OrgId;
  id: number;
  status: CounterTransactionStatus;
  subtotalCents: number;
  totalCents: number;
  stagedSquareOrderId?: string | null;
  priorOrderRef?: string | null;
  customerId?: number | null;
  customer?: CounterVisitCustomer | null;
  devices?: CounterVisitDevice[];
  session?: SessionFixture | null;
  squareTransaction?: CounterVisitSquareTransaction | null;
}

interface Fake {
  deps: ReadVisitDeps;
  calls: { findHeader: number; findDevices: number; findLines: number; findAuditTrail: number };
}

/** Registers visits by (orgId, id) — a lookup by id alone under the wrong org must miss. */
function fakes(fixtures: VisitFixture[]): Fake {
  const byKey = new Map(fixtures.map((f) => [`${f.orgId}:${f.id}`, f]));
  const bySessionId = new Map(
    fixtures.filter((f) => f.session).map((f) => [f.session!.sessionId, f]),
  );
  const calls = { findHeader: 0, findDevices: 0, findLines: 0, findAuditTrail: 0 };

  const deps: ReadVisitDeps = {
    async runInTransaction(_orgId, fn) {
      return fn({ __fake: true });
    },
    async findHeader(_tx, orgId, id) {
      calls.findHeader += 1;
      const f = byKey.get(`${orgId}:${id}`);
      if (!f) return null;
      return {
        id: f.id,
        status: f.status,
        customerId: f.customerId ?? null,
        priorOrderRef: f.priorOrderRef ?? null,
        stagedSquareOrderId: f.stagedSquareOrderId ?? null,
        subtotalCents: f.subtotalCents,
        totalCents: f.totalCents,
        createdAt: '2026-08-22 10:00:00',
        updatedAt: '2026-08-22 10:05:00',
      };
    },
    async findCustomer(_tx, orgId, customerId) {
      const f = fixtures.find((v) => v.orgId === orgId && v.customerId === customerId);
      return f?.customer ?? null;
    },
    async findDevices(_tx, orgId, counterTransactionId) {
      calls.findDevices += 1;
      const f = byKey.get(`${orgId}:${counterTransactionId}`);
      return f?.devices ?? [];
    },
    async findSession(_tx, orgId, counterTransactionId) {
      const f = byKey.get(`${orgId}:${counterTransactionId}`);
      if (!f?.session) return null;
      return {
        sessionId: f.session.sessionId,
        claimedByStaffId: f.session.claimedByStaffId,
        claimedByStaffName: f.session.claimedByStaffName,
        paymentState: f.session.paymentState,
      };
    },
    async findLines(_tx, _orgId, sessionId) {
      calls.findLines += 1;
      const f = bySessionId.get(sessionId);
      return f?.session?.lines ?? [];
    },
    async findTransactionLines() {
      calls.findLines += 1;
      return [];
    },
    async findSquareTransaction(_tx, orgId, counterTransactionId) {
      const f = byKey.get(`${orgId}:${counterTransactionId}`);
      return f?.squareTransaction ?? null;
    },
    async findAuditTrail(_tx, _orgId, sessionIds) {
      calls.findAuditTrail += 1;
      if (sessionIds.length === 0) return [];
      const f = bySessionId.get(sessionIds[0]);
      return f?.session?.auditTrail ?? [];
    },
  };

  return { deps, calls };
}

function device(overrides: Partial<CounterVisitDevice> = {}): CounterVisitDevice {
  return {
    id: 1,
    rsNumber: 'RS-0001',
    serialNumber: 'SN-1',
    productTitle: 'QuietComfort 45',
    status: 'Pending Repair',
    quoteCents: 13000,
    quoteRaw: '$130.00',
    hasSignature: true,
    signatureUrl: 'https://blob.example/sig-1.png',
    signedAt: '2026-08-22 09:58:00',
    createdAt: '2026-08-22 09:55:00',
    ...overrides,
  };
}

function line(overrides: Partial<CounterVisitLine> = {}): CounterVisitLine {
  return {
    id: 'line-1',
    type: 'RETAIL',
    title: 'Bose Earbuds',
    quantity: 1,
    unitAmountCents: 4999,
    payload: {},
    sortIndex: 0,
    voidedAt: null,
    voidReason: null,
    voidedByStaffId: null,
    voidedByStaffName: null,
    ...overrides,
  };
}

describe('loadCounterVisit', () => {
  it('returns null when the transaction does not exist', async () => {
    const f = fakes([]);
    const result = await loadCounterVisit(ORG, 999, f.deps);
    assert.equal(result, null);
    assert.equal(f.calls.findHeader, 1);
  });

  it('does not return a visit belonging to another org', async () => {
    const f = fakes([
      { orgId: ORG, id: 1, status: 'paid', subtotalCents: 5000, totalCents: 5000 },
    ]);
    const result = await loadCounterVisit(OTHER_ORG, 1, f.deps);
    assert.equal(result, null);
  });

  it('a retail-only visit has no devices, no lines, and no session', async () => {
    const f = fakes([
      {
        orgId: ORG,
        id: 10,
        status: 'paid',
        subtotalCents: 4999,
        totalCents: 4999,
        customerId: 7,
        customer: { id: 7, name: 'Jamie Retail', phone: '5551234567', email: null, address: null },
        squareTransaction: {
          id: 'sq-1',
          squareOrderId: 'order-10',
          squarePaymentId: 'pay-10',
          status: 'completed',
          paymentMethod: 'CARD',
          receiptUrl: 'https://squareup.com/receipt/10',
          subtotalCents: 4999,
          taxCents: 0,
          totalCents: 4999,
          discountCents: 0,
          createdAt: '2026-08-22 10:01:00',
        },
      },
    ]);

    const visit = await loadCounterVisit(ORG, 10, f.deps);
    assert.ok(visit);
    assert.equal(visit!.status, 'paid');
    assert.deepEqual(visit!.devices, []);
    assert.deepEqual(visit!.lines, []);
    assert.equal(visit!.claimedByStaffId, null);
    assert.equal(visit!.payment.sessionPaymentState, null);
    assert.equal(visit!.payment.squareTransaction?.receiptUrl, 'https://squareup.com/receipt/10');
    assert.equal(visit!.customer?.name, 'Jamie Retail');
  });

  it('a two-device visit returns BOTH devices in one call — no N+1', async () => {
    const f = fakes([
      {
        orgId: ORG,
        id: 20,
        status: 'staged',
        subtotalCents: 0,
        totalCents: 26000,
        devices: [
          device({ id: 1, rsNumber: 'RS-0001', serialNumber: 'SN-A' }),
          device({ id: 2, rsNumber: 'RS-0002', serialNumber: 'SN-B', quoteCents: 13000 }),
        ],
      },
    ]);

    const visit = await loadCounterVisit(ORG, 20, f.deps);
    assert.ok(visit);
    assert.equal(visit!.devices.length, 2);
    assert.deepEqual(
      visit!.devices.map((d) => d.rsNumber),
      ['RS-0001', 'RS-0002'],
    );
    // The whole point: ONE call fetched both devices, not one call per device.
    assert.equal(f.calls.findDevices, 1);
  });

  it('a voided line is returned WITH its reason and voider — never dropped', async () => {
    const f = fakes([
      {
        orgId: ORG,
        id: 30,
        status: 'paid',
        subtotalCents: 4999,
        totalCents: 4999,
        session: {
          sessionId: 500,
          claimedByStaffId: 3,
          claimedByStaffName: 'Priya Desk',
          paymentState: 'approved',
          lines: [
            line({ id: 'line-1' }),
            line({
              id: 'line-2',
              title: 'Trade-in credit — voided',
              voidedAt: '2026-08-22 10:02:00',
              voidReason: 'Customer changed their mind',
              voidedByStaffId: 3,
              voidedByStaffName: 'Priya Desk',
            }),
          ],
        },
      },
    ]);

    const visit = await loadCounterVisit(ORG, 30, f.deps);
    assert.ok(visit);
    assert.equal(visit!.lines.length, 2);
    const voided = visit!.lines.find((l) => l.id === 'line-2');
    assert.ok(voided);
    assert.equal(voided!.voidedAt, '2026-08-22 10:02:00');
    assert.equal(voided!.voidReason, 'Customer changed their mind');
    assert.equal(voided!.voidedByStaffName, 'Priya Desk');
    assert.equal(f.calls.findLines, 1);
  });

  it('reports a partially_paid header as-is', async () => {
    const f = fakes([
      { orgId: ORG, id: 40, status: 'partially_paid', subtotalCents: 10000, totalCents: 10000 },
    ]);
    const visit = await loadCounterVisit(ORG, 40, f.deps);
    assert.equal(visit?.status, 'partially_paid');
  });

  it('models the two-webhook disagreement: payment_state approved, header still staged', async () => {
    const f = fakes([
      {
        orgId: ORG,
        id: 50,
        status: 'staged',
        subtotalCents: 5000,
        totalCents: 5000,
        session: {
          sessionId: 600,
          claimedByStaffId: 9,
          claimedByStaffName: 'Sam Desk',
          paymentState: 'approved',
        },
      },
    ]);

    const visit = await loadCounterVisit(ORG, 50, f.deps);
    assert.ok(visit);
    assert.equal(visit!.status, 'staged');
    assert.equal(visit!.payment.sessionPaymentState, 'approved');
    // The Terminal said yes; the header — the money's answer — has not moved.
    // Both facts are on the object at once, neither collapsed into the other.
    assert.notEqual(visit!.status, 'paid');
  });

  it('surfaces the money-moving audit trail for the visit session, and no others', async () => {
    const f = fakes([
      {
        orgId: ORG,
        id: 60,
        status: 'paid',
        subtotalCents: 5000,
        totalCents: 5000,
        session: {
          sessionId: 700,
          claimedByStaffId: 1,
          claimedByStaffName: 'Alex Desk',
          paymentState: 'approved',
          auditTrail: [
            {
              id: 1,
              action: 'counter_session.line.void',
              createdAt: '2026-08-22 10:03:00',
              actorStaffId: 1,
              actorStaffName: 'Alex Desk',
              actorRole: 'manager',
              before: { unitAmountCents: 4999 },
              after: { voided: true },
              note: 'Customer changed their mind',
            },
          ],
        },
      },
      // A second visit's session, to prove it does not leak into visit 60's trail.
      {
        orgId: ORG,
        id: 61,
        status: 'paid',
        subtotalCents: 1000,
        totalCents: 1000,
        session: {
          sessionId: 701,
          claimedByStaffId: 2,
          claimedByStaffName: 'Bo Desk',
          paymentState: 'idle',
          auditTrail: [
            {
              id: 2,
              action: 'counter_session.submit',
              createdAt: '2026-08-22 10:04:00',
              actorStaffId: 2,
              actorStaffName: 'Bo Desk',
              actorRole: 'staff',
              before: null,
              after: { counterTransactionId: 61 },
              note: null,
            },
          ],
        },
      },
    ]);

    const visit = await loadCounterVisit(ORG, 60, f.deps);
    assert.ok(visit);
    assert.equal(visit!.auditTrail.length, 1);
    assert.equal(visit!.auditTrail[0].action, 'counter_session.line.void');
    assert.equal(visit!.auditTrail[0].note, 'Customer changed their mind');
    assert.equal(visit!.claimedByStaffName, 'Alex Desk');
  });

  it('skips the audit-trail round trip entirely when the visit has no session', async () => {
    const f = fakes([
      { orgId: ORG, id: 70, status: 'paid', subtotalCents: 100, totalCents: 100 },
    ]);
    const visit = await loadCounterVisit(ORG, 70, f.deps);
    assert.ok(visit);
    assert.deepEqual(visit!.auditTrail, []);
    // findAuditTrail is still called once (to decide there's nothing), but
    // with an empty id list — it must not attempt to resolve a null session.
    assert.equal(f.calls.findAuditTrail, 1);
  });
});
