#!/usr/bin/env tsx
/**
 * Re-render the code-built docs/refactors/sidebar/perf-explain fixtures from the
 * CURRENT query builders, so `scripts/perf-explain-after.sh` explains what the
 * app runs today, not a copy frozen when the fixture was captured.
 *
 * Each fixture is the builder's SQL with its binds inlined by `inlineSqlParams`
 * — the exact text `tenantQueryOneTrip` sends (the custom plan the app gets).
 *
 * Usage: npx tsx --import ./scripts/register-server-only-shim.cjs scripts/perf-explain-render.ts [org-uuid]
 * then:  scripts/perf-explain-after.sh [org-uuid]
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildOrdersListSql } from '../src/lib/orders/orders-list';
import { parseOrdersListQuery } from '../src/lib/orders/orders-list-query';
import { inlineSqlParams } from '../src/lib/tenancy/inline-params';

const DIR = path.resolve('docs/refactors/sidebar/perf-explain');
const ORG = process.argv[2] ?? '00000000-0000-0000-0000-000000000001';
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ORG)) {
  console.error(`org must be a uuid: ${ORG}`);
  process.exit(2);
}

/** Both optional tables present — the dev/prod schema the fixtures were first captured on. */
const SCHEMA = { hasShortage: true, hasReplenishment: true };

/** Fixture name → the `/api/orders` query string it renders. */
const ORDERS_LIST_FIXTURES: Record<string, string> = {
  orders_list_in_warehouse_queue: 'inWarehouse=true&listShape=queue&limit=200',
  orders_list_in_warehouse_staff: 'inWarehouse=true&listShape=queue&limit=200&staff=4',
};

for (const [name, search] of Object.entries(ORDERS_LIST_FIXTURES)) {
  const { sql, params } = buildOrdersListSql(ORG, parseOrdersListQuery(new URLSearchParams(search)), SCHEMA);
  const file = path.join(DIR, `${name}.after.sql`);
  fs.writeFileSync(file, `${inlineSqlParams(sql, params).trim()}\n`);
  console.log(`${name}: ${JSON.stringify(params)} → ${path.relative(process.cwd(), file)}`);
}
