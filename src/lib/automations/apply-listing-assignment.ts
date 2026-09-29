/** applyListingAssignment — evaluate org automation_rules for an order and write work_assignments via the shared upsert helper; with no rule picker, the item's owner by pick history picks. */

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
  triggerRunsWorkType,
  type AssignWorkAction,
  type AutomationRuleRow,
  type AutomationTriggerKey,
  type ListingAutomationFacts,
  type ResolvedAssignee,
  unassignedReason,
} from '@/lib/automations/listing-match';
import { listStaffOutOnDate } from '@/lib/staff/staff-out-today';
import { loadSkuPickerDefaults, resolveItemSkuKeys, type SkuPickerDefault } from '@/lib/picking/sku-pick-owners';

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

/** An applied action plus who took it: the primary, or the backup standing in. `source: 'history'` = the item owner by pick history, no rule. */
type AppliedAssignWorkAction = AssignWorkAction & {
  source?: 'history';
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
  client: QueryClient,
): Promise<AutomationRuleRow[]> {
  const r = await client.query(
    `SELECT id, name, priority, trigger_keys, when_json, then_json
       FROM automation_rules
      WHERE organization_id = $1
        AND deleted_at IS NULL
        AND enabled = true
      ORDER BY priority ASC, id ASC`,
    [organizationId],
  );
  return (r.rows as RuleDbRow[]).map(mapRule);
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

/**
 * Per line, the picker its item's owner by pick history gives it today (the
 * owner, or a backup when they are out) — the default when no rule names a
 * picker. Null when the item has no owner.
 */
async function loadHistoryPickers(
  client: QueryClient,
  organizationId: OrgId,
  factsList: readonly ListingAutomationFacts[],
  listStaffOut: ListStaffOut,
): Promise<(SkuPickerDefault | null)[]> {
  const keys = await resolveItemSkuKeys(client, organizationId, factsList);
  const defaults = await loadSkuPickerDefaults(
    client,
    organizationId,
    keys.filter((key): key is string => key != null),
    (ids) => listStaffOut(organizationId, ids, client),
  );
  return keys.map((key) => (key ? defaults.get(key) ?? null : null));
}

async function applyActions(
  organizationId: OrgId,
  orderId: number,
  actions: ReadonlyArray<AssignWorkAction & { source?: 'history' }>,
  overwriteManual: boolean,
  client: QueryClient,
  listStaffOut: ListStaffOut,
): Promise<{ applied: AppliedAssignWorkAction[]; skipped: string[] }> {
  const applied: AppliedAssignWorkAction[] = [];
  const skipped: string[] = [];
  const outToday = await listStaffOut(organizationId, collectActionStaffIds([...actions]), client);

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
    const filtered = matched ? filterActionsForCsvOverride(matched.actions, facts) : [];
    // Import / item_number_set run PICK + PACK; unit.test_passed re-runs PACK.
    const ruleActions = selectActionsForTrigger(filtered, input.triggerKey);
    const listStaffOut = input.listStaffOut ?? defaultListStaffOut;
    // No rule names a picker: the item's owner by pick history picks.
    const [historyPick] =
      triggerRunsWorkType(input.triggerKey, 'PICK') &&
      !facts.csv_assignee_picker &&
      !ruleActions.some((a) => a.work_type === 'PICK')
        ? await loadHistoryPickers(client, orgId, [facts], listStaffOut)
        : [null];
    const actionsForTrigger = historyPick ? [...ruleActions, historyPick.action] : ruleActions;
    const ruleId = matched?.rule.id ?? null;
    const matchedWhen = matched?.rule.whenJson ?? facts;

    if (actionsForTrigger.length === 0) {
      const reason = !matched ? 'no_matching_rule' : filtered.length === 0 ? 'csv_override' : 'no_actions_for_trigger';
      await writeRun(
        orgId,
        {
          ruleId,
          triggerKey: input.triggerKey,
          entityType: 'order',
          entityId: input.orderId,
          status: 'skipped',
          matchedWhen,
          actionsApplied: [],
          error: reason,
          actorStaffId: input.actorStaffId,
        },
        client,
      );
      return { status: 'skipped', ruleId, actionsApplied: [], reason };
    }

    const { applied, skipped } = await applyActions(
      orgId,
      input.orderId,
      actionsForTrigger,
      input.overwriteManual === true,
      client,
      listStaffOut,
    );

    if (applied.length === 0) {
      await writeRun(
        orgId,
        {
          ruleId,
          triggerKey: input.triggerKey,
          entityType: 'order',
          entityId: input.orderId,
          status: 'skipped',
          matchedWhen,
          actionsApplied: [],
          error: skipped.join(',') || 'nothing_applied',
          actorStaffId: input.actorStaffId,
        },
        client,
      );
      return {
        status: 'skipped',
        ruleId,
        actionsApplied: [],
        reason: skipped.join(',') || 'nothing_applied',
      };
    }

    await writeRun(
      orgId,
      {
        ruleId,
        triggerKey: input.triggerKey,
        entityType: 'order',
        entityId: input.orderId,
        status: 'applied',
        matchedWhen,
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
            ruleId,
            actions: applied,
          },
        },
        { query: (text, params) => client.query(text, params) },
      );
    } catch {
      // Best-effort spine; assignment already committed in this tx.
    }

    return { status: 'applied', ruleId, actionsApplied: applied };
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

/** Who takes one order line's PICK / PACK today, and whether a rule or pick history says so. */
export type PreviewAssignee = ResolvedAssignee & { source: 'rule' | 'history' };

/** Who {@link applyListingAssignment} would put on one order line's PICK / PACK today — read-only. */
export type ListingAssigneePreview = {
  rule: { id: number; name: string } | null;
  pick: PreviewAssignee | null;
  pack: PreviewAssignee | null;
};

/**
 * The same first-match + out-today resolution {@link applyListingAssignment}
 * runs on import — including the pick-history picker when no rule names one —
 * for facts that are not an order yet (the new-order form shows the picker /
 * packer before save). One rules read, one out-today read per source for the
 * whole batch.
 */
export async function previewListingAssignees(
  organizationId: OrgId,
  factsList: readonly ListingAutomationFacts[],
): Promise<ListingAssigneePreview[]> {
  if (factsList.length === 0) return [];
  return withTenantTransaction(organizationId, async (client) => {
    const rules = await loadEnabledListingRules(organizationId, client);
    const matches = factsList.map((facts) => matchListingRule(rules, 'order.imported', facts));
    const outToday = await listStaffOutOnDate(
      organizationId,
      matches.flatMap((m) => (m ? collectActionStaffIds(m.actions) : [])),
      { client },
    );
    const ruleAssignee = (m: (typeof matches)[number], workType: AssignWorkAction['work_type']): PreviewAssignee | null => {
      const action = m?.actions.find((a) => a.work_type === workType);
      const resolved = action ? resolveActionAssignee(action, outToday) : null;
      return resolved ? { ...resolved, source: 'rule' } : null;
    };
    const needHistory = factsList.filter((_, i) => !matches[i]?.actions.some((a) => a.work_type === 'PICK'));
    const historyPicks = await loadHistoryPickers(client, organizationId, needHistory, defaultListStaffOut);
    let h = 0;
    return matches.map((m) => {
      const ruleHasPick = m?.actions.some((a) => a.work_type === 'PICK') ?? false;
      const history = ruleHasPick ? null : historyPicks[h++];
      return {
        rule: m ? { id: m.rule.id, name: m.rule.name } : null,
        pick: ruleHasPick ? ruleAssignee(m, 'PICK') : history ? { ...history.assignee, source: 'history' } : null,
        pack: ruleAssignee(m, 'PACK'),
      };
    });
  });
}
