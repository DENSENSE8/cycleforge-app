/**
 * Listing automation matcher — pure first-match against when_json facts.
 *
 * Widens the decision-eval spirit (partial when, first-match-wins) for OMS
 * listing facts without forking a third evaluator for Studio floor graphs.
 */

import type { AutomationTriggerKey } from '@/lib/schemas/automations';

export type { AutomationTriggerKey };

export type AssignWorkAction = {
  type: 'assign_work';
  /** PICK = the order's picker, PACK = its packer. */
  work_type: 'PICK' | 'PACK';
  staff_id: number;
  /** Takes the action when `staff_id` is out that PST day. Never equals staff_id. */
  backup_staff_id?: number;
};

/** Who actually takes an action today, and whether the backup stood in. */
export type ResolvedAssignee = { staffId: number; via: 'primary' | 'backup' };

type AutomationAction = AssignWorkAction;

export type ListingAutomationFacts = {
  item_number?: string | null;
  sku_catalog_id?: number | null;
  sku?: string | null;
  account_source?: string | null;
  /** When true, CSV (or other row-level) assignee already set — rules skip assign. */
  csv_assignee_picker?: boolean;
  csv_assignee_packer?: boolean;
};

export type AutomationRuleRow = {
  id: number;
  name: string;
  priority: number;
  triggerKeys: string[];
  whenJson: Record<string, unknown>;
  thenJson: unknown;
};

/** Normalize marketplace item numbers the same way manuals / platform ids do. */
export function normalizeItemNumber(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/**
 * Normalize a SKU for rule keys: trim + upper-case. Same as
 * platform_listings.merchant_sku_normalized (UPPER(BTRIM(sku))) and the
 * ux_automation_rules_org_item_number_sku index expression.
 */
export function normalizeSku(raw: string | null | undefined): string {
  return String(raw ?? '').trim().toUpperCase();
}

function factString(facts: ListingAutomationFacts, key: string): string | null {
  if (key === 'item_number') {
    const n = normalizeItemNumber(facts.item_number);
    return n || null;
  }
  if (key === 'sku_catalog_id') {
    return facts.sku_catalog_id == null ? null : String(facts.sku_catalog_id);
  }
  if (key === 'sku') {
    const s = normalizeSku(facts.sku);
    return s || null;
  }
  if (key === 'account_source') {
    const s = String(facts.account_source ?? '').trim().toLowerCase();
    return s || null;
  }
  return null;
}

function whenExpected(when: Record<string, unknown>, key: string): string | null {
  const v = when[key];
  if (v == null || v === '') return null;
  if (key === 'item_number') return normalizeItemNumber(String(v)) || null;
  if (key === 'sku') return normalizeSku(String(v)) || null;
  if (key === 'account_source') return String(v).trim().toLowerCase() || null;
  return String(v).trim() || null;
}

/** Every present when key must equal the corresponding fact. Empty when = catch-all. */
export function ruleMatchesFacts(
  when: Record<string, unknown>,
  facts: ListingAutomationFacts,
): boolean {
  const keys = ['item_number', 'sku_catalog_id', 'sku', 'account_source'] as const;
  let constrained = false;
  for (const key of keys) {
    const expected = whenExpected(when, key);
    if (expected == null) continue;
    constrained = true;
    const actual = factString(facts, key);
    if (actual == null || actual !== expected) return false;
  }
  // A rule with no usable when keys never matches (avoids accidental catch-alls from empty JSON).
  if (!constrained) return false;
  return true;
}

export function parseAssignActions(raw: unknown): AssignWorkAction[] {
  if (!Array.isArray(raw)) return [];
  const out: AssignWorkAction[] = [];
  for (const row of raw) {
    if (row == null || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (String(r.type ?? '') !== 'assign_work') continue;
    const workType = String(r.work_type ?? '').toUpperCase();
    if (workType !== 'PICK' && workType !== 'PACK') continue;
    const staffId = Number(r.staff_id);
    if (!Number.isFinite(staffId) || staffId <= 0) continue;
    const action: AssignWorkAction = { type: 'assign_work', work_type: workType, staff_id: staffId };
    // An invalid backup, or one equal to the primary, is dropped — the
    // primary still applies.
    const backupId = r.backup_staff_id == null ? NaN : Number(r.backup_staff_id);
    if (Number.isInteger(backupId) && backupId > 0 && backupId !== staffId) {
      action.backup_staff_id = backupId;
    }
    out.push(action);
  }
  return out;
}

/** Every primary + backup staff id the actions could resolve to (deduped). */
export function collectActionStaffIds(actions: readonly AssignWorkAction[]): number[] {
  const ids = new Set<number>();
  for (const a of actions) {
    ids.add(a.staff_id);
    if (a.backup_staff_id != null) ids.add(a.backup_staff_id);
  }
  return [...ids];
}

/**
 * Primary unless out today; else the backup unless also out; else null —
 * the work stays unassigned so anyone can claim it.
 */
export function resolveActionAssignee(
  action: AssignWorkAction,
  outToday: ReadonlySet<number>,
): ResolvedAssignee | null {
  if (!outToday.has(action.staff_id)) return { staffId: action.staff_id, via: 'primary' };
  const backup = action.backup_staff_id;
  if (backup != null && !outToday.has(backup)) return { staffId: backup, via: 'backup' };
  return null;
}

/**
 * Reason code when {@link resolveActionAssignee} returns null. Persisted in
 * automation_runs.error and order results — keep the strings stable.
 */
export function unassignedReason(action: AssignWorkAction): string {
  return `${action.work_type}:${action.backup_staff_id == null ? 'primary_out' : 'primary_and_backup_out'}`;
}

/** Rules arrive sorted by priority ASC, id ASC. */
export function matchListingRule(
  rules: readonly AutomationRuleRow[],
  triggerKey: AutomationTriggerKey,
  facts: ListingAutomationFacts,
): { rule: AutomationRuleRow; actions: AssignWorkAction[] } | null {
  let firstMatch: { rule: AutomationRuleRow; actions: AssignWorkAction[] } | null = null;
  for (const rule of rules) {
    if (!rule.triggerKeys.includes(triggerKey)) continue;
    const when =
      rule.whenJson && typeof rule.whenJson === 'object'
        ? (rule.whenJson as Record<string, unknown>)
        : {};
    if (!ruleMatchesFacts(when, facts)) continue;
    const actions = parseAssignActions(rule.thenJson);
    if (actions.length === 0) continue;
    const isPairRule =
      whenExpected(when, 'item_number') != null && whenExpected(when, 'sku') != null;
    if (isPairRule) return { rule, actions };
    firstMatch ??= { rule, actions };
  }
  return firstMatch;
}

/** Filter assign actions by CSV override flags (row beats rule). */
export function filterActionsForCsvOverride(
  actions: readonly AssignWorkAction[],
  facts: ListingAutomationFacts,
): AssignWorkAction[] {
  return actions.filter((a) => {
    if (a.work_type === 'PICK' && facts.csv_assignee_picker) return false;
    if (a.work_type === 'PACK' && facts.csv_assignee_packer) return false;
    return true;
  });
}

/** Does this trigger run assign actions of this work type? */
export function triggerRunsWorkType(
  triggerKey: AutomationTriggerKey,
  workType: AssignWorkAction['work_type'],
): boolean {
  // P2: trigger exists for P3 subscribers. PICK|PACK never run on this key —
  // listing upserts stay on LISTING_AUTOMATION_TRIGGER_KEYS so dock scans
  // cannot assign pickers.
  if (triggerKey === 'identification.completed') return false;
  if (triggerKey === 'unit.test_passed') return workType === 'PACK';
  return true;
}

/** Which assign actions a trigger runs. */
export function selectActionsForTrigger(
  actions: readonly AssignWorkAction[],
  triggerKey: AutomationTriggerKey,
): AssignWorkAction[] {
  return actions.filter((a) => triggerRunsWorkType(triggerKey, a.work_type));
}

/**
 * Should a QC PASS attempt listing→pending allocate?
 * FAIL / TEST_AGAIN never pick.
 */
export function shouldPassAllocate(verdict: string): boolean {
  return verdict === 'PASS';
}
