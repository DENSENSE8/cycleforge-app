/** applyListingAssignment — evaluate org automation_rules for an order and write work_assignments via the shared upsert helper. */

import type { PoolClient } from 'pg';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { recordOpsEvent } from '@/lib/ops-events';
import {
  getActiveOrderAssignee,
  upsertOrderAssignment,
  type QueryClient,
} from '@/lib/work-assignments/upsert-order-assignment';
import {
  collectActionStaffIds,
  filterActionsForCsvOverride,
  matchListingRule,
  normalizeItemNumber,
  resolveActionAssignee,
  selectActionsForTrigger,
  type AssignWorkAction,
  type AutomationRuleRow,
  type AutomationTriggerKey,
  type ListingAutomationFacts,
  type ResolvedAssignee,
  unassignedReason,
} from '@/lib/automations/listing-match';
import { listStaffOutOnDate } from '@/lib/staff/staff-out-today';

/** Loads the staff among `staffIds` who are out today. Test seam. */
type ListStaffOut = (
  organizationId: OrgId,
  staffIds: number[],
  client: QueryClient,
) => Promise<ReadonlySet<number>>;

const defaultListStaffOut: ListStaffOut = (organizationId, staffIds, client) =>
  listStaffOutOnDate(organizationId, staffIds, { client });

type ApplyListingAssignmentInput = {
  organizationId: OrgId;
  orderId: number;
  triggerKey: AutomationTriggerKey;
  facts: ListingAutomationFacts;
  actorStaffId?: number | null;
  /** When true, overwrite an existing ASSIGNED assignee. v1 default false. */
  overwriteManual?: boolean;
  /** Optional client already inside a tenant transaction. */
  client?: QueryClient;
  /** Out-today lookup; defaults to listStaffOutOnDate (today, PST). */
  listStaffOut?: ListStaffOut;
};

/** An applied action plus who took it: the primary, or the backup standing in. */
type AppliedAssignWorkAction = AssignWorkAction & {
  assigned_staff_id: number;
  via: ResolvedAssignee['via'];
};

type ApplyListingAssignmentResult = {
  status: 'applied' | 'skipped' | 'failed';
  ruleId: number | null;
  actionsApplied: AppliedAssignWorkAction[];
  reason?: string;
  error?: string;
};

type RuleDbRow = {
  id: number;
  name: string;
  priority: number;
  trigger_keys: string[] | null;
  when_json: Record<string, unknown> | null;
  then_json: unknown;
};

function mapRule(row: RuleDbRow): AutomationRuleRow {
  return {
    id: Number(row.id),
    name: String(row.name),
    priority: Number(row.priority) || 100,
    triggerKeys: Array.isArray(row.trigger_keys) ? row.trigger_keys.map(String) : [],
    whenJson: (row.when_json && typeof row.when_json === 'object' ? row.when_json : {}) as Record<
      string,
      unknown
    >,
    thenJson: row.then_json ?? [],
  };
}

async function loadEnabledListingRules(
  organizationId: OrgId,
  client?: QueryClient,
): Promise<AutomationRuleRow[]> {
  const sql = `
    SELECT id, name, priority, trigger_keys, when_json, then_json
      FROM automation_rules
     WHERE organization_id = $1
       AND deleted_at IS NULL
       AND enabled = true
     ORDER BY priority ASC, id ASC`;
  if (client) {
    const r = await client.query(sql, [organizationId]);
    return (r.rows as RuleDbRow[]).map(mapRule);
  }
  const r = await tenantQuery<RuleDbRow>(organizationId, sql, [organizationId]);
  return r.rows.map(mapRule);
}

async function writeRun(
  organizationId: OrgId,
  input: {
    ruleId: number | null;
    triggerKey: string;
    entityType: string;
    entityId: number;
    status: 'applied' | 'skipped' | 'failed';
    matchedWhen: unknown;
    actionsApplied: unknown;
    error?: string | null;
    actorStaffId?: number | null;
  },
  client: QueryClient,
): Promise<void> {
  await client.query(
    `INSERT INTO automation_runs (
       organization_id, rule_id, trigger_key, entity_type, entity_id,
       status, matched_when, actions_applied, error, actor_staff_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)`,
    [
      organizationId,
      input.ruleId,
      input.triggerKey,
      input.entityType,
      input.entityId,
      input.status,
      JSON.stringify(input.matchedWhen ?? null),
      JSON.stringify(input.actionsApplied ?? null),
      input.error ?? null,
      input.actorStaffId ?? null,
    ],
  );
}

async function applyActions(
  organizationId: OrgId,
  orderId: number,
  actions: AssignWorkAction[],
  overwriteManual: boolean,
  client: QueryClient,
  listStaffOut: ListStaffOut,
): Promise<{ applied: AppliedAssignWorkAction[]; skipped: string[] }> {
  const applied: AppliedAssignWorkAction[] = [];
  const skipped: string[] = [];
  const outToday = await listStaffOut(organizationId, collectActionStaffIds(actions), client);

  for (const action of actions) {
    const resolved = resolveActionAssignee(action, outToday);
    if (!resolved) {
      // Leave the work unassigned so anyone can claim it.
      skipped.push(unassignedReason(action));
      continue;
    }
    const appliedAction: AppliedAssignWorkAction = {
      ...action,
      assigned_staff_id: resolved.staffId,
      via: resolved.via,
    };
    const current = await getActiveOrderAssignee(organizationId, orderId, action.work_type, client);
    if (
      current &&
      current.status !== 'OPEN' &&
      current.staffId != null &&
      current.staffId !== resolved.staffId &&
      !overwriteManual
    ) {
      skipped.push(`${action.work_type}:manual_assignee_${current.staffId}`);
      continue;
    }
    if (current?.staffId === resolved.staffId && current.status === 'ASSIGNED') {
      // Idempotent — already correct.
      applied.push(appliedAction);
      continue;
    }
    await upsertOrderAssignment(
      organizationId,
      orderId,
      action.work_type,
      resolved.staffId,
      client,
    );
    applied.push(appliedAction);
  }

  return { applied, skipped };
}

async function runInClient(
  client: QueryClient,
  input: ApplyListingAssignmentInput,
): Promise<ApplyListingAssignmentResult> {
  const orgId = input.organizationId;
  const facts: ListingAutomationFacts = {
    ...input.facts,
    item_number: normalizeItemNumber(input.facts.item_number) || input.facts.item_number,
  };

  try {
    const rules = await loadEnabledListingRules(orgId, client);
    const matched = matchListingRule(rules, input.triggerKey, facts);
    if (!matched) {
      await writeRun(
        orgId,
        {
          ruleId: null,
          triggerKey: input.triggerKey,
          entityType: 'order',
          entityId: input.orderId,
          status: 'skipped',
          matchedWhen: facts,
          actionsApplied: [],
          error: 'no_matching_rule',
          actorStaffId: input.actorStaffId,
        },
        client,
      );
      return { status: 'skipped', ruleId: null, actionsApplied: [], reason: 'no_matching_rule' };
    }

    const filtered = filterActionsForCsvOverride(matched.actions, facts);
    if (filtered.length === 0) {
      await writeRun(
        orgId,
        {
          ruleId: matched.rule.id,
          triggerKey: input.triggerKey,
          entityType: 'order',
          entityId: input.orderId,
          status: 'skipped',
          matchedWhen: matched.rule.whenJson,
          actionsApplied: [],
          error: 'csv_override',
          actorStaffId: input.actorStaffId,
        },
        client,
      );
      return {
        status: 'skipped',
        ruleId: matched.rule.id,
        actionsApplied: [],
        reason: 'csv_override',
      };
    }

    // Import / item_number_set run PICK + PACK; unit.test_passed re-runs PACK.
    const actionsForTrigger = selectActionsForTrigger(filtered, input.triggerKey);

    if (actionsForTrigger.length === 0) {
      await writeRun(
        orgId,
        {
          ruleId: matched.rule.id,
          triggerKey: input.triggerKey,
          entityType: 'order',
          entityId: input.orderId,
          status: 'skipped',
          matchedWhen: matched.rule.whenJson,
          actionsApplied: [],
          error: 'no_actions_for_trigger',
          actorStaffId: input.actorStaffId,
        },
        client,
      );
      return {
        status: 'skipped',
        ruleId: matched.rule.id,
        actionsApplied: [],
        reason: 'no_actions_for_trigger',
      };
    }

    const { applied, skipped } = await applyActions(
      orgId,
      input.orderId,
      actionsForTrigger,
      input.overwriteManual === true,
      client,
      input.listStaffOut ?? defaultListStaffOut,
    );

    if (applied.length === 0) {
      await writeRun(
        orgId,
        {
          ruleId: matched.rule.id,
          triggerKey: input.triggerKey,
          entityType: 'order',
          entityId: input.orderId,
          status: 'skipped',
          matchedWhen: matched.rule.whenJson,
          actionsApplied: [],
          error: skipped.join(',') || 'nothing_applied',
          actorStaffId: input.actorStaffId,
        },
        client,
      );
      return {
        status: 'skipped',
        ruleId: matched.rule.id,
        actionsApplied: [],
        reason: skipped.join(',') || 'nothing_applied',
      };
    }

    await writeRun(
      orgId,
      {
        ruleId: matched.rule.id,
        triggerKey: input.triggerKey,
        entityType: 'order',
        entityId: input.orderId,
        status: 'applied',
        matchedWhen: matched.rule.whenJson,
        actionsApplied: applied,
        actorStaffId: input.actorStaffId,
      },
      client,
    );

    try {
      await recordOpsEvent(
        {
          organizationId: orgId,
          entityType: 'order',
          entityId: input.orderId,
          eventType: 'automation.listing_assignment',
          actorStaffId: input.actorStaffId ?? null,
          payload: {
            triggerKey: input.triggerKey,
            ruleId: matched.rule.id,
            actions: applied,
          },
        },
        { query: (text, params) => client.query(text, params) },
      );
    } catch {
      // Best-effort spine; assignment already committed in this tx.
    }

    return { status: 'applied', ruleId: matched.rule.id, actionsApplied: applied };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await writeRun(
        orgId,
        {
          ruleId: null,
          triggerKey: input.triggerKey,
          entityType: 'order',
          entityId: input.orderId,
          status: 'failed',
          matchedWhen: facts,
          actionsApplied: [],
          error: message,
          actorStaffId: input.actorStaffId,
        },
        client,
      );
    } catch {
      /* swallow secondary write failure */
    }
    return {
      status: 'failed',
      ruleId: null,
      actionsApplied: [],
      error: message,
    };
  }
}

/**
 * Evaluate listing automations for an order. When `client` is omitted, opens a
 * tenant transaction. When provided, runs inside the caller's transaction.
 */
export async function applyListingAssignment(
  input: ApplyListingAssignmentInput,
): Promise<ApplyListingAssignmentResult> {
  if (input.client) {
    return runInClient(input.client, input);
  }
  return withTenantTransaction(input.organizationId, async (client) =>
    runInClient(client as PoolClient, input),
  );
}

/** Load order listing facts for automation evaluation. */
export async function loadOrderListingFacts(
  organizationId: OrgId,
  orderId: number,
  client?: QueryClient,
): Promise<ListingAutomationFacts | null> {
  const sql = `
    SELECT item_number, sku_catalog_id, sku, account_source
      FROM orders
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`;
  const rows = client
    ? ((await client.query(sql, [orderId, organizationId])).rows as Array<{
        item_number: string | null;
        sku_catalog_id: number | null;
        sku: string | null;
        account_source: string | null;
      }>)
    : (
        await tenantQuery<{
          item_number: string | null;
          sku_catalog_id: number | null;
          sku: string | null;
          account_source: string | null;
        }>(organizationId, sql, [orderId, organizationId])
      ).rows;

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    item_number: row.item_number,
    sku_catalog_id: row.sku_catalog_id == null ? null : Number(row.sku_catalog_id),
    sku: row.sku,
    account_source: row.account_source,
  };
}

/** Who a listing rule would put on one order line's PICK / PACK today — read-only. */
export type ListingAssigneePreview = {
  ruleId: number;
  ruleName: string;
  pick: ResolvedAssignee | null;
  pack: ResolvedAssignee | null;
} | null;

/**
 * The same first-match + out-today resolution {@link applyListingAssignment}
 * runs on import, for facts that are not an order yet (the new-order form
 * shows the rule's picker / packer before save). One rules read, one
 * out-today read for the whole batch.
 */
export async function previewListingAssignees(
  organizationId: OrgId,
  factsList: readonly ListingAutomationFacts[],
): Promise<ListingAssigneePreview[]> {
  if (factsList.length === 0) return [];
  const rules = await loadEnabledListingRules(organizationId);
  const matches = factsList.map((facts) => matchListingRule(rules, 'order.imported', facts));
  const outToday = await listStaffOutOnDate(
    organizationId,
    matches.flatMap((m) => (m ? collectActionStaffIds(m.actions) : [])),
  );
  return matches.map((m) => {
    if (!m) return null;
    const resolve = (workType: AssignWorkAction['work_type']) => {
      const action = m.actions.find((a) => a.work_type === workType);
      return action ? resolveActionAssignee(action, outToday) : null;
    };
    return { ruleId: m.rule.id, ruleName: m.rule.name, pick: resolve('PICK'), pack: resolve('PACK') };
  });
}
