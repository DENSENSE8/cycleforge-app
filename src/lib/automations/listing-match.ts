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
  work_type: 'TEST' | 'PACK';
  staff_id: number;
};

export type AutomationAction = AssignWorkAction;

export type ListingAutomationFacts = {
  item_number?: string | null;
  sku_catalog_id?: number | null;
  sku?: string | null;
  account_source?: string | null;
  /** When true, CSV (or other row-level) assignee already set — rules skip assign. */
  csv_assignee_tech?: boolean;
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
  // A rule with no usable when keys never matches (avoids accidental catch-alls
  // from empty JSON). Explicit `{}` catch-all is still allowed when when has
  // only unknown keys that we ignore — treat empty object as no-match for safety
  // unless the operator set at least one known key OR an empty object with
  // `_catch_all: true`. For v1 listing rules we require item_number OR sku_catalog_id.
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
    if (workType !== 'TEST' && workType !== 'PACK') continue;
    const staffId = Number(r.staff_id);
    if (!Number.isFinite(staffId) || staffId <= 0) continue;
    out.push({ type: 'assign_work', work_type: workType, staff_id: staffId });
  }
  return out;
}

/**
 * Rules arrive sorted by priority ASC, id ASC. Among enabled rules whose
 * trigger includes `triggerKey`, whose when matches facts, and that carry at
 * least one assign action: the first (item #, SKU) pair rule — both keys in
 * when — wins regardless of priority, so it beats the item-#-only
 * listing-wide wildcard; with no matching pair rule, the first match of any
 * shape wins (priority order).
 */
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
    if (a.work_type === 'TEST' && facts.csv_assignee_tech) return false;
    if (a.work_type === 'PACK' && facts.csv_assignee_packer) return false;
    return true;
  });
}

/**
 * Import / item_number_set apply TEST immediately; PACK waits for
 * unit.test_passed (after PASS allocate). Pure — used by applyListingAssignment
 * and unit-tested without a DB.
 */
export function selectActionsForTrigger(
  actions: readonly AssignWorkAction[],
  triggerKey: AutomationTriggerKey,
): AssignWorkAction[] {
  if (triggerKey === 'identification.completed') {
    // P2: trigger exists for P3 subscribers. TEST|PACK never run on this key —
    // listing upserts stay on LISTING_AUTOMATION_TRIGGER_KEYS so dock scans
    // cannot assign testers.
    return [];
  }
  if (triggerKey === 'unit.test_passed') {
    return actions.filter((a) => a.work_type === 'PACK');
  }
  return actions.filter((a) => a.work_type === 'TEST');
}

/**
 * Should a QC PASS attempt listing→pending allocate?
 * FAIL / TEST_AGAIN never pick.
 */
export function shouldPassAllocate(verdict: string): boolean {
  return verdict === 'PASS';
}
