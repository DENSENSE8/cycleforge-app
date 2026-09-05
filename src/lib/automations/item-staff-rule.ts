/**
 * The "always this staff for this product" rule, as ONE client-scoped write.
 *
 * Writes the same `automation_rules` document the To-ship bulk overlay writes
 * (`listing-assign-from-orders.ts` → `upsertRuleForItemNumber`): one active
 * rule per normalized item number, `then` = assign_work TEST (the Pick /
 * tester slot on the To-ship desk) + assign_work PACK (the packer slot). It
 * exists as a separate module because the assistant chokepoint
 * (`applyAgentMutation`) runs every apply inside ONE tenant transaction on a
 * caller-owned client, and the bulk helper opens its own connections.
 *
 * Every write states its own inverse so the chokepoint can revert it:
 *   • created  → `automation_rule.delete { ruleId }`
 *   • updated  → `automation_rule.upsert_item_staff` with the PREVIOUS staff
 *   • deleted  → `automation_rule.upsert_item_staff` with the deleted staff
 *
 * `assignPending` also stamps the two slots onto every not-yet-shipped order
 * carrying the item number, through the shared `upsertOrderAssignment` waist
 * (work_assignments is the SoT; orders.* assignee columns are never written).
 */

import { normalizeItemNumber } from '@/lib/automations/listing-match';
import { AUTOMATION_TRIGGER_KEYS } from '@/lib/schemas/automations';
import type { OrgId } from '@/lib/tenancy/constants';

/** The caller-owned transaction client (pg PoolClient-shaped, no DB import here). */
export type ItemStaffRuleClient = {
  query: (text: string, params?: ReadonlyArray<unknown>) => Promise<{ rows: Array<Record<string, unknown>> }>;
};
type Client = ItemStaffRuleClient;

/**
 * The shared ORDER/TEST|PACK upsert waist. Injected (default = the real
 * module, loaded lazily) because that module reaches `@/lib/db`, which is
 * `server-only` — importing it at the top would make this writer, and the
 * assistant chokepoint above it, un-importable in the DB-free unit suites.
 */
export type AssignOrderWork = (
  organizationId: string,
  orderId: number,
  workType: 'TEST' | 'PACK',
  staffId: number | null,
  client: Client,
) => Promise<void>;

const defaultAssignOrderWork: AssignOrderWork = async (organizationId, orderId, workType, staffId, client) => {
  const mod = await import('@/lib/work-assignments/upsert-order-assignment');
  await mod.upsertOrderAssignment(organizationId, orderId, workType, staffId, client as never);
};

export interface ItemStaffRuleDeps {
  assignOrderWork: AssignOrderWork;
}

export interface ItemStaffRulePayload {
  /** Any spelling — normalized here the way the rule index normalizes it. */
  itemNumber: string;
  /** TEST slot — the "Pick" column on the To-ship desk. */
  techStaffId: number;
  /** PACK slot — the "Packed" column on the To-ship desk. */
  packerStaffId: number;
  /** Also assign every pending (not shipped) order for this item now. Default true. */
  assignPending?: boolean;
}

export interface ItemStaffRuleInverse {
  kind: 'automation_rule.delete' | 'automation_rule.upsert_item_staff';
  payload: Record<string, unknown>;
}

export type ItemStaffRuleWriteResult =
  | {
      ok: true;
      ruleId: number;
      itemNumber: string;
      outcome: 'created' | 'updated';
      assignedOrderIds: number[];
      inverse: ItemStaffRuleInverse;
    }
  | { ok: false; status: 400 | 404 | 409; error: string };

export type ItemStaffRuleDeleteResult =
  | { ok: true; ruleId: number; itemNumber: string; inverse: ItemStaffRuleInverse }
  | { ok: false; status: 400 | 404 | 409; error: string };

/** Pending on the To-ship desk means "not shipped yet" (same predicate as auto-cage). */
const PENDING_ORDERS_FOR_ITEM = `
  SELECT id
    FROM orders
   WHERE organization_id = $1
     AND upper(regexp_replace(trim(COALESCE(item_number, '')), '[^A-Za-z0-9]', '', 'g')) = $2
     AND lower(COALESCE(status, '')) <> 'shipped'
   ORDER BY id DESC
   LIMIT 200`;

const ACTIVE_RULE_FOR_ITEM = `
  SELECT id, then_json
    FROM automation_rules
   WHERE organization_id = $1
     AND deleted_at IS NULL
     AND NULLIF(trim(COALESCE(when_json->>'item_number', '')), '') IS NOT NULL
     AND upper(regexp_replace(trim(when_json->>'item_number'), '[^A-Za-z0-9]', '', 'g')) = $2
   ORDER BY priority ASC, id ASC
   LIMIT 1
   FOR UPDATE`;

function positiveInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function staffFromThen(thenJson: unknown): { techStaffId: number | null; packerStaffId: number | null } {
  const out = { techStaffId: null as number | null, packerStaffId: null as number | null };
  if (!Array.isArray(thenJson)) return out;
  for (const a of thenJson) {
    if (!a || typeof a !== 'object') continue;
    const action = a as { type?: unknown; work_type?: unknown; staff_id?: unknown };
    if (action.type !== 'assign_work') continue;
    const id = positiveInt(action.staff_id);
    if (action.work_type === 'TEST') out.techStaffId = id;
    if (action.work_type === 'PACK') out.packerStaffId = id;
  }
  return out;
}

function thenJsonFor(techStaffId: number, packerStaffId: number): string {
  return JSON.stringify([
    { type: 'assign_work', work_type: 'TEST', staff_id: techStaffId },
    { type: 'assign_work', work_type: 'PACK', staff_id: packerStaffId },
  ]);
}

export async function upsertItemStaffRule(
  client: Client,
  orgId: OrgId,
  raw: Partial<ItemStaffRulePayload>,
  actorStaffId: number | null,
  deps: ItemStaffRuleDeps = { assignOrderWork: defaultAssignOrderWork },
): Promise<ItemStaffRuleWriteResult> {
  const itemNumber = normalizeItemNumber(String(raw.itemNumber ?? ''));
  const techStaffId = positiveInt(raw.techStaffId);
  const packerStaffId = positiveInt(raw.packerStaffId);
  const assignPending = raw.assignPending !== false;
  if (!itemNumber) return { ok: false, status: 400, error: 'itemNumber is required' };
  if (!techStaffId || !packerStaffId) {
    return { ok: false, status: 400, error: 'techStaffId and packerStaffId must be positive staff ids' };
  }

  // Both staff must be this org's, and active — a rule pointing at a stranger
  // would silently assign nobody on every import.
  const staff = await client.query(
    `SELECT id FROM staff WHERE organization_id = $1 AND id = ANY($2::int[]) AND active = true`,
    [orgId, [...new Set([techStaffId, packerStaffId])]],
  );
  const found = new Set(staff.rows.map((r) => Number(r.id)));
  const missing = [techStaffId, packerStaffId].filter((id) => !found.has(id));
  if (missing.length > 0) {
    return { ok: false, status: 404, error: `staff not found or inactive in this org: ${missing.join(', ')}` };
  }

  const existing = await client.query(ACTIVE_RULE_FOR_ITEM, [orgId, itemNumber]);
  const name = `Listing ${itemNumber}`;
  let ruleId: number;
  let outcome: 'created' | 'updated';
  let inverse: ItemStaffRuleInverse;

  if (existing.rows[0]) {
    ruleId = Number(existing.rows[0].id);
    outcome = 'updated';
    const prev = staffFromThen(existing.rows[0].then_json);
    await client.query(
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
        ruleId,
        orgId,
        name,
        [...AUTOMATION_TRIGGER_KEYS],
        JSON.stringify({ item_number: itemNumber }),
        thenJsonFor(techStaffId, packerStaffId),
        actorStaffId,
      ],
    );
    inverse =
      prev.techStaffId && prev.packerStaffId
        ? {
            kind: 'automation_rule.upsert_item_staff',
            payload: {
              itemNumber,
              techStaffId: prev.techStaffId,
              packerStaffId: prev.packerStaffId,
              assignPending: false,
            },
          }
        : { kind: 'automation_rule.delete', payload: { ruleId } };
  } else {
    const inserted = await client.query(
      `INSERT INTO automation_rules (
         organization_id, name, enabled, priority, trigger_keys,
         when_json, then_json, created_by_staff_id, updated_by_staff_id
       ) VALUES (
         $1, $2, true, 100, $3::text[], $4::jsonb, $5::jsonb, $6, $6
       )
       RETURNING id`,
      [
        orgId,
        name,
        [...AUTOMATION_TRIGGER_KEYS],
        JSON.stringify({ item_number: itemNumber }),
        thenJsonFor(techStaffId, packerStaffId),
        actorStaffId,
      ],
    );
    ruleId = Number(inserted.rows[0]?.id);
    if (!Number.isFinite(ruleId)) return { ok: false, status: 409, error: 'rule insert returned no id' };
    outcome = 'created';
    inverse = { kind: 'automation_rule.delete', payload: { ruleId } };
  }

  const assignedOrderIds: number[] = [];
  if (assignPending) {
    const pending = await client.query(PENDING_ORDERS_FOR_ITEM, [orgId, itemNumber]);
    for (const row of pending.rows) {
      const orderId = Number(row.id);
      if (!Number.isFinite(orderId)) continue;
      await deps.assignOrderWork(orgId, orderId, 'TEST', techStaffId, client);
      await deps.assignOrderWork(orgId, orderId, 'PACK', packerStaffId, client);
      assignedOrderIds.push(orderId);
    }
  }

  return { ok: true, ruleId, itemNumber, outcome, assignedOrderIds, inverse };
}

export async function deleteItemStaffRule(
  client: Client,
  orgId: OrgId,
  raw: { ruleId?: unknown },
): Promise<ItemStaffRuleDeleteResult> {
  const ruleId = positiveInt(raw.ruleId);
  if (!ruleId) return { ok: false, status: 400, error: 'ruleId is required' };
  const r = await client.query(
    `UPDATE automation_rules
        SET deleted_at = NOW(), enabled = false, updated_at = NOW()
      WHERE id = $2 AND organization_id = $1 AND deleted_at IS NULL
      RETURNING id, when_json, then_json`,
    [orgId, ruleId],
  );
  const row = r.rows[0];
  if (!row) return { ok: false, status: 404, error: `automation rule ${ruleId} not found` };
  const when = (row.when_json ?? {}) as { item_number?: unknown };
  const itemNumber = normalizeItemNumber(String(when.item_number ?? ''));
  const prev = staffFromThen(row.then_json);
  const inverse: ItemStaffRuleInverse =
    itemNumber && prev.techStaffId && prev.packerStaffId
      ? {
          kind: 'automation_rule.upsert_item_staff',
          payload: {
            itemNumber,
            techStaffId: prev.techStaffId,
            packerStaffId: prev.packerStaffId,
            assignPending: false,
          },
        }
      : { kind: 'automation_rule.delete', payload: { ruleId } };
  return { ok: true, ruleId, itemNumber, inverse };
}
