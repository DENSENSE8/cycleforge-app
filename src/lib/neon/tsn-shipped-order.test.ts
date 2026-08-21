import { test } from 'node:test';
import { match, ok } from 'node:assert/strict';
import { FIND_SHIPPED_ORDER_BY_TSN_SQL, findShippedOrderByTsnSerial } from './tsn-shipped-order';
import type { Queryable } from './serial-units-queries';

test('TSN ship lookup ignores serials hung on a tracking after PACK_COMPLETED', () => {
  match(FIND_SHIPPED_ORDER_BY_TSN_SQL, /PACK_COMPLETED/);
  match(FIND_SHIPPED_ORDER_BY_TSN_SQL, /SERIAL_ADDED/);
  match(FIND_SHIPPED_ORDER_BY_TSN_SQL, /NOT EXISTS/);
  match(FIND_SHIPPED_ORDER_BY_TSN_SQL, /from tech_serial_numbers/i);
});

test('findShippedOrderByTsnSerial runs the post-pack-filtered query', async () => {
  const calls: string[] = [];
  const executor: Queryable = {
    async query<T>(text: string) {
      calls.push(text);
      ok(/PACK_COMPLETED/.test(text));
      return { rows: [] as T[], rowCount: 0 };
    },
  };
  const result = await findShippedOrderByTsnSerial('SN-1', { executor });
  ok(result === null);
  ok(calls.length === 1);
});
