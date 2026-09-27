/** Bulk listing→staff from to-ship selection: */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  collectActionStaffIds,
  normalizeItemNumber,
  normalizeSku,
  parseAssignActions,
  resolveActionAssignee,
  type AssignWorkAction,
  type ResolvedAssignee,
  unassignedReason,
} from '@/lib/automations/listing-match';
import { LISTING_AUTOMATION_TRIGGER_KEYS } from '@/lib/schemas/automations';
import { upsertOrderAssignment } from '@/lib/work-assignments/upsert-order-assignment';
import { applyListingAssignment } from '@/lib/automations/apply-listing-assignment';
import { listStaffOutOnDate } from '@/lib/staff/staff-out-today';

type ListingAssignMode = 'save_and_assign' | 'apply_existing';

type ListingAssignInput = {
  organizationId: OrgId;
  orderIds: number[];
  mode: ListingAssignMode;
  /** Required when mode is save_and_assign. */
  techId?: number | null;
  packerId?: number | null;
  /** Optional; takes the work when the primary is out that day. */
  backupTechId?: number | null;
  backupPackerId?: number | null;
  actorStaffId?: number | null;
};

export type ListingAssignOrderResult = {
  orderId: number;
  itemNumber: string | null;
  sku: string | null;
  status: 'assigned' | 'rule_applied' | 'skipped' | 'failed';
  reason?: string;
  /** save_and_assign: who took each role now, primary or backup. */
  assigned?: Partial<Record<AssignWorkAction['work_type'], ResolvedAssignee>>;
};

/** The rule keying a previewed pair, flattened for the rule editor. */
export type ListingRuleSummary = {
  id: number;
  techId: number | null;
  backupTechId: number | null;
  packerId: number | null;
  backupPackerId: number | null;
};

/** One rule key: normalized item # + normalized SKU (null = item-#-only wildcard). */
type ListingSkuPair = { itemNumber: string; sku: string | null };

type ListingAssignResult = {
  mode: ListingAssignMode;
  orderResults: ListingAssignOrderResult[];
  rulesUpserted: number;
  listings: Array<ListingSkuPair & { orderCount: number }>;
  skippedNoItemNumber: number;
};

type OrderFact = {
  id: number;
  item_number: string | null;
  sku_catalog_id: number | null;
  sku: string | null;
  account_source: string | null;
};

async function loadOrderFacts(
  organizationId: OrgId,
  orderIds: number[],
): Promise<OrderFact[]> {
  if (orderIds.length === 0) return [];
  const r = await tenantQuery<OrderFact>(
    organizationId,
    `SELECT id, item_number, sku_catalog_id, sku, account_source
       FROM orders
      WHERE organization_id = $1 AND id = ANY($2::bigint[])`,
    [organizationId, orderIds],
  );
  return r.rows.map((row) => ({
    id: Number(row.id),
    item_number: row.item_number,
    sku_catalog_id: row.sku_catalog_id == null ? null : Number(row.sku_catalog_id),
    sku: row.sku,
    account_source: row.account_source,
  }));
}

/** Group order lines by (normalized item #, normalized SKU); lines without an item # are counted apart. */
function groupByPair(facts: OrderFact[]): {
  pairs: Array<ListingSkuPair & { rows: OrderFact[] }>;
  noItemNumber: OrderFact[];
} {
  const byKey = new Map<string, ListingSkuPair & { rows: OrderFact[] }>();
  const noItemNumber: OrderFact[] = [];
  for (const row of facts) {
    const itemNumber = normalizeItemNumber(row.item_number);
    if (!itemNumber) {
      noItemNumber.push(row);
      continue;
    }
    const sku = normalizeSku(row.sku) || null;
    const key = `${itemNumber}\u0000${sku ?? ''}`;
    const group = byKey.get(key) ?? { itemNumber, sku, rows: [] };
    group.rows.push(row);
    byKey.set(key, group);
  }
  return { pairs: [...byKey.values()], noItemNumber };
}

/** then_json for a listing rule; a null backup omits the key. */
function buildAssignActions(staff: {
  techId: number;
  backupTechId: number | null;
  packerId: number;
  backupPackerId: number | null;
}): AssignWorkAction[] {
  const pick: AssignWorkAction = { type: 'assign_work', work_type: 'PICK', staff_id: staff.techId };
  if (staff.backupTechId != null) pick.backup_staff_id = staff.backupTechId;
  const pack: AssignWorkAction = { type: 'assign_work', work_type: 'PACK', staff_id: staff.packerId };
  if (staff.backupPackerId != null) pack.backup_staff_id = staff.backupPackerId;
  return [pick, pack];
}

async function upsertRuleForPair(
  organizationId: OrgId,
  pair: ListingSkuPair,
  thenJson: AssignWorkAction[],
  actorStaffId: number | null,
): Promise<'created' | 'updated'> {
  const whenJson = pair.sku
    ? { item_number: pair.itemNumber, sku: pair.sku }
    : { item_number: pair.itemNumber };
  const name = pair.sku ? `Listing ${pair.itemNumber} · ${pair.sku}` : `Listing ${pair.itemNumber}`;

  // Same key expressions as ux_automation_rules_org_item_number_sku.
  const existing = await tenantQuery<{ id: number }>(
    organizationId,
    `SELECT id FROM automation_rules
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND NULLIF(trim(COALESCE(when_json->>'item_number', '')), '') IS NOT NULL
        AND upper(regexp_replace(trim(COALESCE(when_json->>'item_number', '')), '[^A-Za-z0-9]', '', 'g')) = $2
        AND upper(btrim(COALESCE(when_json->>'sku', ''))) = $3
      LIMIT 1`,
    [organizationId, pair.itemNumber, pair.sku ?? ''],
  );

  if (existing.rows[0]) {
    await tenantQuery(
      organizationId,
      `UPDATE automation_rules
          SET name = $3,
              enabled = true,
              trigger_keys = $4::text[],
              when_json = $5::jsonb,
              then_json = $6::jsonb,
              updated_by_staff_id = $7,
              updated_at = NOW()
        WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [
        existing.rows[0].id,
        organizationId,
        name,
        [...LISTING_AUTOMATION_TRIGGER_KEYS],
        JSON.stringify(whenJson),
        JSON.stringify(thenJson),
        actorStaffId,
      ],
    );
    return 'updated';
  }

  await tenantQuery(
    organizationId,
    `INSERT INTO automation_rules (
       organization_id, name, enabled, priority, trigger_keys,
       when_json, then_json, created_by_staff_id, updated_by_staff_id
     ) VALUES (
       $1, $2, true, 100, $3::text[], $4::jsonb, $5::jsonb, $6, $6
     )`,
    [
      organizationId,
      name,
      [...LISTING_AUTOMATION_TRIGGER_KEYS],
      JSON.stringify(whenJson),
      JSON.stringify(thenJson),
      actorStaffId,
    ],
  );
  return 'created';
}

type PreviewRuleRow = {
  id: number;
  when_json: Record<string, unknown> | null;
  then_json: unknown;
};

/** Only item # (+ SKU) rules are editable from the to-ship rail. */
const LISTING_RULE_WHEN_KEYS = new Set(['item_number', 'sku']);

function summarizeRule(id: number, actions: AssignWorkAction[]): ListingRuleSummary {
  const pick = actions.find((a) => a.work_type === 'PICK');
  const pack = actions.find((a) => a.work_type === 'PACK');
  return {
    id,
    techId: pick?.staff_id ?? null,
    backupTechId: pick?.backup_staff_id ?? null,
    packerId: pack?.staff_id ?? null,
    backupPackerId: pack?.backup_staff_id ?? null,
  };
}

/**
 * Preview (item #, SKU) pairs covered by a set of order ids (for the to-ship
 * overlay), each with the enabled rule that keys it: the exact pair rule, else
 * the item-#-only wildcard — matchListingRule's precedence.
 */
export async function previewListingAssign(
  organizationId: OrgId,
  orderIds: number[],
): Promise<{
  listings: Array<
    ListingSkuPair & { orderCount: number; orderIds: number[]; rule: ListingRuleSummary | null }
  >;
  skippedNoItemNumber: number;
  totalOrders: number;
}> {
  const facts = await loadOrderFacts(organizationId, orderIds);
  const { pairs, noItemNumber } = groupByPair(facts);

  const itemNumbers = [...new Set(pairs.map((p) => p.itemNumber))];
  const ruleRows =
    itemNumbers.length === 0
      ? []
      : (
          await tenantQuery<PreviewRuleRow>(
            organizationId,
            `SELECT id, when_json, then_json
               FROM automation_rules
              WHERE organization_id = $1
                AND deleted_at IS NULL
                AND enabled = true
                AND upper(regexp_replace(trim(COALESCE(when_json->>'item_number', '')), '[^A-Za-z0-9]', '', 'g')) = ANY($2::text[])
              ORDER BY priority ASC, id ASC`,
            [organizationId, itemNumbers],
          )
        ).rows;

  // item # → { pair rules by SKU, first item-#-only rule }, first-wins in priority order.
  const rulesByItem = new Map<
    string,
    { bySku: Map<string, ListingRuleSummary>; wildcard: ListingRuleSummary | null }
  >();
  for (const row of ruleRows) {
    const when = row.when_json ?? {};
    if (!Object.keys(when).every((k) => LISTING_RULE_WHEN_KEYS.has(k))) continue;
    const actions = parseAssignActions(row.then_json);
    if (actions.length === 0) continue;
    const itemNumber = normalizeItemNumber(String(when.item_number ?? ''));
    const sku = normalizeSku(String(when.sku ?? ''));
    const entry = rulesByItem.get(itemNumber) ?? { bySku: new Map(), wildcard: null };
    const summary = summarizeRule(Number(row.id), actions);
    if (sku) {
      if (!entry.bySku.has(sku)) entry.bySku.set(sku, summary);
    } else {
      entry.wildcard ??= summary;
    }
    rulesByItem.set(itemNumber, entry);
  }

  return {
    totalOrders: facts.length,
    skippedNoItemNumber: noItemNumber.length,
    listings: pairs.map(({ itemNumber, sku, rows }) => {
      const entry = rulesByItem.get(itemNumber);
      return {
        itemNumber,
        sku,
        orderCount: rows.length,
        orderIds: rows.map((r) => r.id),
        rule: (sku ? entry?.bySku.get(sku) : undefined) ?? entry?.wildcard ?? null,
      };
    }),
  };
}

export async function listingAssignFromOrders(
  input: ListingAssignInput,
): Promise<ListingAssignResult> {
  const orgId = input.organizationId;
  const orderIds = [...new Set(input.orderIds.filter((id) => Number.isFinite(id) && id > 0))];
  const facts = await loadOrderFacts(orgId, orderIds);
  const foundIds = new Set(facts.map((f) => f.id));

  const orderResults: ListingAssignOrderResult[] = [];
  for (const id of orderIds) {
    if (!foundIds.has(id)) {
      orderResults.push({
        orderId: id,
        itemNumber: null,
        sku: null,
        status: 'skipped',
        reason: 'order_not_found',
      });
    }
  }

  const { pairs, noItemNumber } = groupByPair(facts);
  for (const row of noItemNumber) {
    orderResults.push({
      orderId: row.id,
      itemNumber: null,
      sku: normalizeSku(row.sku) || null,
      status: 'skipped',
      reason: 'no_item_number',
    });
  }

  const listings = pairs.map(({ itemNumber, sku, rows }) => ({
    itemNumber,
    sku,
    orderCount: rows.length,
  }));

  let rulesUpserted = 0;

  if (input.mode === 'save_and_assign') {
    const techId = Number(input.techId);
    const packerId = Number(input.packerId);
    if (!Number.isFinite(techId) || techId <= 0 || !Number.isFinite(packerId) || packerId <= 0) {
      throw new Error('techId and packerId are required for save_and_assign');
    }
    const actions = buildAssignActions({
      techId,
      backupTechId: input.backupTechId ?? null,
      packerId,
      backupPackerId: input.backupPackerId ?? null,
    });
    if (actions.some((a) => a.backup_staff_id === a.staff_id)) {
      throw new Error('backup staff must differ from the primary');
    }

    for (const pair of pairs) {
      await upsertRuleForPair(orgId, pair, actions, input.actorStaffId ?? null);
      rulesUpserted += 1;
    }

    // Same primary→backup resolution as the engine; today's roster applies to
    // every order in the selection.
    const outToday =
      pairs.length === 0
        ? new Set<number>()
        : await listStaffOutOnDate(orgId, collectActionStaffIds(actions));
    const resolved = actions.map((action) => ({
      action,
      assignee: resolveActionAssignee(action, outToday),
    }));

    for (const { itemNumber, sku, rows } of pairs) {
      for (const row of rows) {
        try {
          const assigned: ListingAssignOrderResult['assigned'] = {};
          const unassigned: string[] = [];
          for (const { action, assignee } of resolved) {
            if (!assignee) {
              unassigned.push(unassignedReason(action));
              continue;
            }
            await upsertOrderAssignment(orgId, row.id, action.work_type, assignee.staffId);
            assigned[action.work_type] = assignee;
          }
          orderResults.push({
            orderId: row.id,
            itemNumber,
            sku,
            status: Object.keys(assigned).length > 0 ? 'assigned' : 'skipped',
            ...(unassigned.length > 0 ? { reason: unassigned.join(',') } : {}),
            assigned,
          });
        } catch (err) {
          orderResults.push({
            orderId: row.id,
            itemNumber,
            sku,
            status: 'failed',
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  } else {
    for (const { itemNumber, sku, rows } of pairs) {
      for (const row of rows) {
        try {
          const result = await applyListingAssignment({
            organizationId: orgId,
            orderId: row.id,
            triggerKey: 'order.item_number_set',
            facts: {
              item_number: itemNumber,
              sku_catalog_id: row.sku_catalog_id,
              sku: row.sku,
              account_source: row.account_source,
            },
            actorStaffId: input.actorStaffId,
          });
          orderResults.push({
            orderId: row.id,
            itemNumber,
            sku,
            status: result.status === 'applied' ? 'rule_applied' : 'skipped',
            reason: result.reason ?? result.error,
          });
        } catch (err) {
          orderResults.push({
            orderId: row.id,
            itemNumber,
            sku,
            status: 'failed',
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  return {
    mode: input.mode,
    orderResults,
    rulesUpserted,
    listings,
    skippedNoItemNumber: noItemNumber.length,
  };
}
