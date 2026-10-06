/**
 * A pack station's own history (`population: 'packed'`) holds a pack the
 * moment it lands; the Fulfilled list (default) waits for its dock scan-out.
 *
 *   node --import tsx --import ./scripts/register-server-only-shim.cjs --test src/lib/neon/packer-logs-population.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OrgId } from '@/lib/tenancy/constants';
import { buildPackerLogBaseWhere, sqlLatestShipConfirmAt } from './packer-logs-week';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const WEEK = { weekStart: '2026-10-04', weekEnd: '2026-10-10' };

test('the Fulfilled list requires a staffed scan-out and windows by it', () => {
  const sql = buildPackerLogBaseWhere({ organizationId: ORG, packerId: 5, ...WEEK }, []).conditions.join('\n');
  assert.match(sql, /EXISTS \(\s*SELECT 1 FROM station_activity_logs so\s+WHERE so\.activity_type = 'SHIP_CONFIRM'/);
  assert.ok(sql.includes(`${sqlLatestShipConfirmAt()} >= `), 'Fulfilled windows by the scan-out');
});

test("a packer's own packs need no scan-out and window by the pack instant", () => {
  const params: unknown[] = [];
  const { conditions } = buildPackerLogBaseWhere({ organizationId: ORG, population: 'packed', packerId: 5, ...WEEK }, params);
  const sql = conditions.join('\n');
  assert.doesNotMatch(sql, /SHIP_CONFIRM/, 'a fresh, not-yet-scanned-out pack must be in the population');
  assert.ok(conditions.includes(`sal.station = 'PACK'`));
  assert.ok(conditions.includes(`(sal.station = 'PACK' AND sal.staff_id = $2)`));
  assert.ok(sql.includes(`sal.created_at >= ($3::date - interval '1 day')`));
  assert.ok(sql.includes(`sal.created_at <  ($4::date + interval '2 days')`));
  assert.deepEqual(params, [ORG, 5, WEEK.weekStart, WEEK.weekEnd]);
});
