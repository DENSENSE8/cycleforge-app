import test from 'node:test';
import assert from 'node:assert/strict';
import type { PoolClient } from 'pg';
import { deleteOrderDependentsInTx, deleteOrderInTx, OrderDeleteBlockedError } from './orders-queries';

const ORG = '00000000-0000-0000-0000-0000000000aa';

/** A pg client that records every statement and answers the few reads deleteOrderInTx makes. */
function fakeClient(opts: { exists?: boolean; customerId?: number | null; appliedLabel?: boolean }) {
  const sql: Array<{ text: string; params: unknown[] }> = [];
  const client = {
    query: async (text: string, params: unknown[] = []) => {
      sql.push({ text: text.replace(/\s+/g, ' ').trim(), params });
      if (/^SELECT id, customer_id FROM orders/.test(sql.at(-1)!.text)) {
        return { rows: opts.exists === false ? [] : [{ id: params[0], customer_id: opts.customerId ?? null }], rowCount: 1 };
      }
      if (text.includes('has_applied_labels')) {
        return { rows: [{ has_applied_labels: Boolean(opts.appliedLabel), has_label_ingestion_links: false }], rowCount: 1 };
      }
      if (text.includes('FROM order_unit_allocations a')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    },
  } as unknown as PoolClient;
  return { client, sql };
}

const touching = (sql: Array<{ text: string }>, re: RegExp) => sql.filter((s) => re.test(s.text));

test('deleteOrderInTx removes the row and every leak: assignments, feed rows, ORDER links, its own customer', async () => {
  const { client, sql } = fakeClient({ customerId: 42 });
  assert.equal(await deleteOrderInTx(client, { orderId: 7, orgId: ORG, actorStaffId: 3 }), true);

  const order = sql.findIndex((s) => /^DELETE FROM orders WHERE id = \$1/.test(s.text));
  assert.ok(order > 0, 'the order row is deleted');
  for (const re of [/^DELETE FROM work_assignments .*entity_type = 'ORDER'/, /^DELETE FROM feed_memberships .*'ORDER'/, /^DELETE FROM shipment_links .*owner_type = 'ORDER'/]) {
    const hit = touching(sql, re);
    assert.equal(hit.length, 1, String(re));
    assert.deepEqual(hit[0].params, [[7], ORG]);
  }
  const customers = touching(sql, /^DELETE FROM customers c/);
  assert.equal(customers.length, 1);
  assert.deepEqual(customers[0].params, [[42], ORG]);
  // Only a customer nothing else names, never a Zoho / repair contact.
  for (const guard of ['zoho_contact_id IS NULL', 'entity_type IS NULL', 'FROM orders o WHERE o.customer_id = c.id', 'repair_service', 'warranty_claims', 'sales_orders', 'rma_authorizations', 'support_interactions', 'counter_transactions']) {
    assert.ok(customers[0].text.includes(guard), guard);
  }
  assert.ok(sql.findIndex((s) => /^DELETE FROM customers/.test(s.text)) > order, 'customer goes after the order releases it');
});

test('deleteOrderInTx without a customer issues no customer delete', async () => {
  const { client, sql } = fakeClient({ customerId: null });
  await deleteOrderInTx(client, { orderId: 7, orgId: ORG });
  assert.deepEqual(touching(sql, /^DELETE FROM customers/), []);
});

test('deleteOrderInTx refuses an applied label before writing anything', async () => {
  const { client, sql } = fakeClient({ appliedLabel: true });
  await assert.rejects(deleteOrderInTx(client, { orderId: 7, orgId: ORG }), OrderDeleteBlockedError);
  assert.deepEqual(touching(sql, /^(DELETE|UPDATE|INSERT)/), []);
});

test('deleteOrderInTx answers false for a row outside the org, writing nothing', async () => {
  const { client, sql } = fakeClient({ exists: false });
  assert.equal(await deleteOrderInTx(client, { orderId: 7, orgId: ORG }), false);
  assert.deepEqual(touching(sql, /^(DELETE|UPDATE|INSERT)/), []);
});

test('deleteOrderDependentsInTx: nothing to do for no orders', async () => {
  const { client, sql } = fakeClient({});
  await deleteOrderDependentsInTx(client, ORG, [], [1]);
  assert.deepEqual(sql, []);
});
