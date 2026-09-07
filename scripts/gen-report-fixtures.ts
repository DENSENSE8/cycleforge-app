/**
 * THROWAWAY — generate the five operator-report payloads from the REAL builders
 * against a fake `deps.query`, so the Storybook screenshot proves the whole
 * chain (SQL row shape -> builder math -> zod contract -> renderer) and not just
 * a hand-written blob.
 *
 * Run: node --import tsx --import ./scripts/register-server-only-shim.cjs scripts/gen-report-fixtures.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { sessionArtifactSchema } from '@/lib/assistant/ui-artifacts';
import { buildPackingPerformanceReport } from '@/lib/reports/packing-performance';
import { buildUnboxBacklogReport } from '@/lib/reports/unbox-backlog';
import { buildOrderValueRankReport } from '@/lib/reports/order-value-rank';
import { buildRoiRankReport } from '@/lib/reports/roi-rank';
import { buildDelegationPlanReport } from '@/lib/reports/delegation-plan';
import type { AssistantToolCtx, AssistantToolQueryResult } from '@/lib/assistant/tools/types';
import type { OrgId } from '@/lib/tenancy/constants';

const ORG = '11111111-2222-3333-4444-555555555555' as OrgId;
const CTX: AssistantToolCtx = {
  organizationId: ORG,
  staffId: 7,
  permissions: new Set([
    'operations.view',
    'receiving.view',
    'dashboard.view',
    'work_orders.view',
  ]),
};
const NOW = new Date('2026-09-06T18:40:00Z'); // 11:40 PT
const DAY = '2026-09-06';

type Row = Record<string, unknown>;
type Q = (orgId: OrgId, sql: string, params?: ReadonlyArray<unknown>) => Promise<AssistantToolQueryResult>;
const route = (pick: (sql: string) => Row[]): { query: Q } => ({
  query: async (_orgId, sql) => ({ rows: pick(sql) as Array<Record<string, unknown>> }),
});

// ─── 1. Packing performance ──────────────────────────────────────────────────

const completion = (over: Row & { sal_id: number }): Row => ({
  staff_id: 7,
  packer: 'Maria Delgado',
  completed_at: `${DAY}T09:00:00`,
  completed_hm: '09:00',
  pack_tier: 'SMALL',
  tier_source: 'rules',
  standard_minutes: '5',
  handle_minutes: '6',
  wait_minutes: null,
  attended_minutes: '235',
  item_number: '1122334455',
  sku: 'BOSE-SOLO5',
  product_title: 'Bose Solo 5 TV sound system',
  scan_ref: '1Z999AA10123456784',
  ...over,
});

const PACK_ROWS: Row[] = [
  completion({
    sal_id: 9,
    completed_hm: '11:35',
    completed_at: `${DAY}T11:35:00`,
    pack_tier: 'LARGE',
    tier_source: 'sku_profile',
    standard_minutes: '60',
    handle_minutes: '52',
    wait_minutes: '4',
    item_number: '9087661234',
    sku: 'BOSE-LS650',
    product_title: 'Bose Lifestyle 650 home theater system, console + 5 omnijewel speakers',
  }),
  completion({
    sal_id: 8,
    completed_hm: '10:31',
    completed_at: `${DAY}T10:31:00`,
    pack_tier: 'MEDIUM',
    standard_minutes: '15',
    handle_minutes: '17',
    wait_minutes: '9',
    item_number: '4455661122',
    sku: 'BOSE-WAVE-IV',
    product_title: 'Bose Wave Music System IV with remote and pedestal',
  }),
  completion({
    sal_id: 7,
    completed_hm: '10:05',
    completed_at: `${DAY}T10:05:00`,
    pack_tier: 'MEDIUM',
    standard_minutes: '15',
    handle_minutes: '13',
    wait_minutes: '2',
    item_number: '4455661123',
    sku: 'BOSE-SD-II',
    product_title: 'Bose SoundDock Series II digital music system',
  }),
  completion({
    sal_id: 6,
    completed_hm: '09:50',
    completed_at: `${DAY}T09:50:00`,
    pack_tier: 'SMALL',
    standard_minutes: '5',
    handle_minutes: '4',
    wait_minutes: '1',
    item_number: '7788990011',
    sku: 'BOSE-RMT-20',
    product_title: 'Bose universal remote, OEM replacement',
  }),
  completion({
    sal_id: 5,
    completed_hm: '09:44',
    completed_at: `${DAY}T09:44:00`,
    pack_tier: 'SMALL',
    standard_minutes: '5',
    handle_minutes: '7',
    wait_minutes: '120',
    item_number: null,
    sku: null,
    product_title: null,
    scan_ref: 'TRK-770041',
  }),
  completion({
    sal_id: 4,
    completed_hm: '09:31',
    completed_at: `${DAY}T09:31:00`,
    pack_tier: 'SMALL',
    standard_minutes: '5',
    handle_minutes: '5',
    wait_minutes: '3',
    item_number: '7788990012',
    sku: 'BOSE-PSU-12',
    product_title: 'Bose power supply, 12V OEM',
  }),
  completion({
    sal_id: 3,
    completed_hm: '09:20',
    completed_at: `${DAY}T09:20:00`,
    pack_tier: 'MEDIUM',
    standard_minutes: '15',
    handle_minutes: '14',
    wait_minutes: '2',
    item_number: '4455661124',
    sku: 'BOSE-ACM-10',
    product_title: 'Bose Acoustimass 10 Series V speaker system',
  }),
  completion({ sal_id: 1, completed_hm: '09:06', completed_at: `${DAY}T09:06:00` }),
];

const packDeps = route((sql) => {
  if (sql.includes('org_pack_capacity')) {
    return [
      {
        packer_headcount: 2,
        workday_minutes: 480,
        daily_medium_target: 60,
        daily_large_target: 16,
      },
    ];
  }
  if (sql.includes('ILIKE')) {
    return [{ id: 7, name: 'Maria Delgado', role: 'packer' }];
  }
  return PACK_ROWS;
});

// ─── 2. Unbox backlog ────────────────────────────────────────────────────────

const ageRow = (age_days: number, over: Row = {}): Row => ({
  age_days,
  boxes: 1,
  units: 8,
  on_bench: 0,
  returns_ct: 0,
  priority_ct: 0,
  unfound_ct: 0,
  ...over,
});

const unboxDeps = route((sql) => {
  if (sql.includes('GROUP BY b.age_days')) {
    return [
      ageRow(0, { boxes: 9, units: 74, on_bench: 2 }),
      ageRow(1, { boxes: 6, units: 51, returns_ct: 2, priority_ct: 1 }),
      ageRow(2, { boxes: 4, units: 33, unfound_ct: 1 }),
      ageRow(3, { boxes: 3, units: 26, returns_ct: 1 }),
      ageRow(6, { boxes: 2, units: 19, unfound_ct: 1, on_bench: 1 }),
      ageRow(11, { boxes: 1, units: 12, unfound_ct: 1 }),
    ];
  }
  if (sql.includes('GROUP BY b.source')) {
    return [
      { source: 'zoho_po', boxes: 16, units: 141, returns_ct: 0, unfound_ct: 1, oldest_days: 11 },
      { source: 'unmatched', boxes: 6, units: 48, returns_ct: 0, unfound_ct: 2, oldest_days: 6 },
      { source: 'local_pickup', boxes: 3, units: 26, returns_ct: 3, unfound_ct: 0, oldest_days: 3 },
    ];
  }
  return [
    { carton_id: 41207, age_days: 11, arrived_at: '2026-08-26T16:12:00Z', po_number: 'PO-8841', lines_ct: 3, units_ct: 12, is_return: false, is_priority: false, pairing_state: 'UNFOUND', opened_at: null },
    { carton_id: 41288, age_days: 6, arrived_at: '2026-08-31T14:03:00Z', po_number: null, lines_ct: 2, units_ct: 9, is_return: false, is_priority: true, pairing_state: 'UNFOUND', opened_at: '2026-09-05T21:40:00Z' },
    { carton_id: 41290, age_days: 6, arrived_at: '2026-08-31T18:22:00Z', po_number: 'PO-8902', lines_ct: 1, units_ct: 10, is_return: false, is_priority: false, pairing_state: 'MATCHED', opened_at: null },
    { carton_id: 41341, age_days: 3, arrived_at: '2026-09-03T15:51:00Z', po_number: 'PO-8933', lines_ct: 4, units_ct: 14, is_return: true, is_priority: false, pairing_state: 'MATCHED', opened_at: null },
    { carton_id: 41402, age_days: 1, arrived_at: '2026-09-05T17:20:00Z', po_number: 'PO-8961', lines_ct: 2, units_ct: 11, is_return: false, is_priority: true, pairing_state: 'MATCHED', opened_at: null },
  ];
});

// ─── 3. Most expensive order ─────────────────────────────────────────────────

const orderDeps = route((sql) => {
  if (sql.includes('GROUP BY s.stage')) {
    return [
      { stage: 'PACKED', stage_rank: 4, orders_ct: 6, value: '7412.00', oldest_days: 4, at_risk_value: '0', with_deadline: 4, currencies: 'USD' },
      { stage: 'PICKED', stage_rank: 3, orders_ct: 9, value: '5188.50', oldest_days: 6, at_risk_value: '1499.00', with_deadline: 7, currencies: 'USD' },
      { stage: 'PENDING', stage_rank: 2, orders_ct: 14, value: '4903.25', oldest_days: 9, at_risk_value: '812.00', with_deadline: 5, currencies: 'USD' },
      { stage: 'AWAITING_LABEL', stage_rank: 0, orders_ct: 5, value: '1240.00', oldest_days: 2, at_risk_value: '0', with_deadline: 1, currencies: 'USD' },
      { stage: 'BLOCKED', stage_rank: 1, orders_ct: 3, value: '2277.00', oldest_days: 12, at_risk_value: '2277.00', with_deadline: 3, currencies: 'USD' },
    ];
  }
  if (sql.includes('ORDER BY s.value DESC')) {
    return [
      { order_key: '11-12874-40012', order_id: '11-12874-40012', value: '3299.00', lines_ct: 4, stage: 'PICKED', age_days: 6, deadline_at: '2026-09-05T23:00:00Z', currency: 'USD', channel: 'ebay_main', tracking: '1Z999AA10123456784', carrier: 'UPS' },
      { order_key: '11-12880-41155', order_id: '11-12880-41155', value: '2277.00', lines_ct: 2, stage: 'BLOCKED', age_days: 12, deadline_at: '2026-09-01T23:00:00Z', currency: 'USD', channel: 'amazon_mfn', tracking: null, carrier: null },
      { order_key: '11-12901-42003', order_id: '11-12901-42003', value: '1899.00', lines_ct: 3, stage: 'PACKED', age_days: 2, deadline_at: '2026-09-08T23:00:00Z', currency: 'USD', channel: 'ebay_main', tracking: '1Z999AA10199887766', carrier: 'UPS' },
      { order_key: '11-12912-42188', order_id: '11-12912-42188', value: '1499.00', lines_ct: 1, stage: 'PENDING', age_days: 9, deadline_at: '2026-09-04T23:00:00Z', currency: 'USD', channel: 'shopify', tracking: null, carrier: null },
      { order_key: '11-12933-43001', order_id: '11-12933-43001', value: '1240.00', lines_ct: 2, stage: 'AWAITING_LABEL', age_days: 2, deadline_at: null, currency: 'USD', channel: 'square', tracking: null, carrier: null },
    ];
  }
  return [
    { row_id: 1, sku: 'BOSE-LS650', product_title: 'Bose Lifestyle 650 home theater system', quantity: '1', sale_amount: '2199.00', currency: 'USD' },
    { row_id: 2, sku: 'BOSE-ACM-10', product_title: 'Bose Acoustimass 10 Series V speaker system', quantity: '1', sale_amount: '649.00', currency: 'USD' },
    { row_id: 3, sku: 'BOSE-WAVE-IV', product_title: 'Bose Wave Music System IV', quantity: '1', sale_amount: '399.00', currency: 'USD' },
    { row_id: 4, sku: 'BOSE-RMT-20', product_title: 'Bose universal remote, OEM', quantity: '2', sale_amount: '52.00', currency: 'USD' },
  ];
});

// ─── 4 + 5. ROI rank and delegation ──────────────────────────────────────────

const GAPS: Record<string, { units: number; oldest: number }> = {
  unlisted_units: { units: 148, oldest: 34 },
  dead_stock: { units: 62, oldest: 121 },
  open_order_exceptions: { units: 11, oldest: 9 },
  open_receiving_exceptions: { units: 23, oldest: 17 },
  units_on_hold: { units: 37, oldest: 6 },
  repairs_in_flight: { units: 14, oldest: 22 },
};

function gapRows(sql: string): Row[] {
  const id = sql.includes('serial_unit_listings')
    ? 'unlisted_units'
    : sql.includes('mv_dead_stock')
      ? 'dead_stock'
      : sql.includes('orders_exceptions')
        ? 'open_order_exceptions'
        : sql.includes('receiving_exceptions')
          ? 'open_receiving_exceptions'
          : sql.includes("'ON_HOLD'")
            ? 'units_on_hold'
            : 'repairs_in_flight';
  const hit = GAPS[id];
  return [{ units: hit?.units ?? 0, oldest_days: hit?.oldest ?? null }];
}

const roiDeps = route((sql) => {
  if (sql.includes('org_pack_capacity')) return [{ workday_minutes: 480 }];
  return gapRows(sql);
});

const STAFF: Row[] = [
  { staff_id: 7, name: 'Maria Delgado', role: 'packer', employee_id: 'PACK-07', stations: ['PACK'] },
  { staff_id: 3, name: 'Devon Price', role: 'tech', employee_id: 'E-1042', stations: ['TECH'] },
  { staff_id: 4, name: 'Ana Ruiz', role: 'tech', employee_id: 'E-1077', stations: ['TECH', 'UNBOX'] },
  { staff_id: 5, name: 'Sam Okafor', role: 'receiver', employee_id: 'UNBOX-2', stations: [] },
  { staff_id: 6, name: 'Priya Nair', role: 'lister', employee_id: 'SALES-4', stations: ['SALES'] },
];

const delegationDeps = route((sql) => {
  if (sql.includes('org_pack_capacity')) return [{ workday_minutes: 480 }];
  if (sql.includes('FROM staff s')) return STAFF;
  if (sql.includes('work_assignments')) {
    return [
      { kind: 'agg', assignee_staff_id: 7, pending: 9, urgent: 2, overdue: 1 },
      { kind: 'agg', assignee_staff_id: 3, pending: 4, urgent: 0, overdue: 0 },
      { kind: 'agg', assignee_staff_id: 4, pending: 2, urgent: 1, overdue: 0 },
      { kind: 'agg', assignee_staff_id: 5, pending: 6, urgent: 0, overdue: 2 },
      { kind: 'row', assignee_staff_id: null, pending: 0, urgent: 0, overdue: 0, what: 'TEST', entity: 'ORDER #42188', entity_type: 'ORDER', entity_id: 42188, priority: 10, deadline_at: '2026-09-04T23:00:00Z', age_days: 5, created_at: '2026-09-01T18:00:00Z' },
      { kind: 'row', assignee_staff_id: null, pending: 0, urgent: 0, overdue: 0, what: 'REPAIR', entity: 'UNIT #7714', entity_type: 'REPAIR', entity_id: 7714, priority: 100, deadline_at: null, age_days: 12, created_at: '2026-08-25T18:00:00Z' },
    ];
  }
  if (sql.includes('ops_plan_tasks')) {
    return [
      { kind: 'agg', assignee_staff_id: 6, pending: 3, urgent: 1, overdue: 1 },
      { kind: 'agg', assignee_staff_id: 3, pending: 1, urgent: 0, overdue: 0 },
      { kind: 'row', assignee_staff_id: null, pending: 0, urgent: 0, overdue: 0, what: 'Relist dormant Wave stock', title: 'Relist dormant Wave stock', station: 'SALES', entity: 'plan: Q3 dead stock', due_at: '2026-09-03T23:00:00Z', age_days: 8, created_at: '2026-08-29T18:00:00Z' },
    ];
  }
  if (sql.includes('station_activity_logs')) {
    return [
      { staff_id: 7, scans: 31 },
      { staff_id: 3, scans: 18 },
      { staff_id: 4, scans: 22 },
      { staff_id: 5, scans: 9 },
      { staff_id: 6, scans: 2 },
    ];
  }
  return gapRows(sql);
});

// ─── Emit ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const built = [
    {
      id: 'packing-performance',
      question: "What is Maria's packing performance today?",
      env: await buildPackingPerformanceReport({ staffName: 'Maria', dayPst: DAY }, CTX, packDeps, NOW),
    },
    {
      id: 'unbox-backlog',
      question: 'How many boxes are left to be unboxed?',
      env: await buildUnboxBacklogReport({}, CTX, unboxDeps, NOW),
    },
    {
      id: 'order-value-rank',
      question: 'What is the most expensive order currently in the warehouse?',
      env: await buildOrderValueRankReport({ limit: 5 }, CTX, orderDeps, NOW),
    },
    {
      id: 'roi-rank',
      question: 'What are the highest ROIs right now?',
      env: await buildRoiRankReport({ limit: 6 }, CTX, roiDeps, NOW),
    },
    {
      id: 'delegation-plan',
      question: 'Which staff can I delegate to attack the highest ROIs in terms of pending tasks?',
      env: await buildDelegationPlanReport({}, CTX, delegationDeps, NOW),
    },
  ];

  const out: Record<string, unknown> = {};
  for (const b of built) {
    const parsed = sessionArtifactSchema.safeParse(b.env.artifact);
    if (!parsed.success) {
      throw new Error(`${b.id} failed the artifact contract: ${parsed.error.message}`);
    }
    out[b.id] = { question: b.question, summary: b.env.summary, artifact: parsed.data };
    console.log(`${b.id.padEnd(20)} ok  ${b.env.summary.slice(0, 90)}`);
  }

  mkdirSync('src/components/session/artifacts/__fixtures__', { recursive: true });
  writeFileSync(
    'src/components/session/artifacts/__fixtures__/operator-reports.json',
    `${JSON.stringify(out, null, 2)}\n`,
  );
  console.log('\nwrote src/components/session/artifacts/__fixtures__/operator-reports.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
