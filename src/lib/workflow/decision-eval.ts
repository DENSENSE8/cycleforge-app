/** decision-eval — the pure rule-table evaluator behind the `decision` node. */

/** The facts a rule matches against — the item's current routing-relevant context. */
export interface DecisionFacts {
  grade?: unknown;
  channel?: unknown;
  disposition?: unknown;
}

/** The placement directive a matched rule may carry alongside its output port (Track 1, Stage 1.x — the placement strangle). */
export interface DecisionPlacement {
  /** Symbolic destination the action layer resolves (e.g. a bin barcode / lane key). */
  placement?: string;
  /** Coarse filing category (e.g. 'parts' / 'graded-stock' / 'scrap'). */
  category?: string;
  /** Target table the unit's row should be written into, if the rule re-homes it. */
  targetTable?: string;
  /** Target work-queue the unit should be enqueued onto. */
  targetQueue?: string;
}

/** A single when→then row. Every PRESENT `when` key must equal the fact to match. */
export interface DecisionRule {
  id: string;
  when: {
    grade?: string;
    channel?: string;
    disposition?: string;
  };
  /** The output port id this rule routes to when it matches. */
  thenPort: string;
  /**
   * Optional domain placement directive the action layer consumes (Stage 1.x).
   * Absent on a pure route-only rule — its absence is what keeps the route-only
   * decision node behavior unchanged.
   */
  then?: DecisionPlacement;
}

/** Parse an unknown JSON value (operator config / DB row) into a DecisionPlacement, or null when it carries no usable directive. */
export function parseDecisionPlacement(raw: unknown): DecisionPlacement | null {
  if (raw == null || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const str = (v: unknown): string | undefined => {
    const s = v == null ? '' : String(v).trim();
    return s ? s : undefined;
  };
  // Build with only the keys that are actually present, so the result carries no
  // `undefined`-valued keys (clean JSON for storage + stable deep-equality).
  const placement: DecisionPlacement = {};
  const p = str(row.placement);
  const c = str(row.category);
  const tt = str(row.targetTable);
  const tq = str(row.targetQueue);
  if (p) placement.placement = p;
  if (c) placement.category = c;
  if (tt) placement.targetTable = tt;
  if (tq) placement.targetQueue = tq;
  return p || c || tt || tq ? placement : null;
}

/** Parse an unknown JSON array (a node's `config.rules`, or a DB row) into typed DecisionRule[] — the single SoT for the rule shape. */
export function parseDecisionRules(raw: unknown): DecisionRule[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r): DecisionRule => {
      const row = (r ?? {}) as Record<string, unknown>;
      const when = (row.when ?? {}) as Record<string, unknown>;
      const placement = parseDecisionPlacement(row.then);
      return {
        id: String(row.id ?? ''),
        when: {
          grade: when.grade != null ? String(when.grade) : undefined,
          channel: when.channel != null ? String(when.channel) : undefined,
          disposition: when.disposition != null ? String(when.disposition) : undefined,
        },
        thenPort: String(row.thenPort ?? ''),
        ...(placement ? { then: placement } : {}),
      };
    })
    .filter((r) => r.thenPort);
}

/** The matched outcome: which graph lane, plus any domain placement the rule carried. */
interface DecisionOutcome {
  /** Output port id (graph routing) — null when no rule matched and no default. */
  port: string | null;
  /** Domain placement directive (bin/table/queue/category), or null when the rule carried none. */
  placement: DecisionPlacement | null;
}

/** The three fact keys a rule can constrain on (kept in sync with DecisionRule.when). */
const WHEN_KEYS = ['grade', 'channel', 'disposition'] as const;

/** Does a rule match the facts? */
function ruleMatches(rule: DecisionRule, facts: DecisionFacts): boolean {
  for (const key of WHEN_KEYS) {
    const expected = rule.when?.[key];
    if (expected == null || expected === '') continue; // key not constrained
    const actual = facts[key];
    if (actual == null) return false;
    if (String(actual) !== String(expected)) return false;
  }
  return true;
}

/** Evaluate the rule table against the facts. */
export function evaluateDecision(
  rules: readonly DecisionRule[],
  defaultPort: string | null | undefined,
  facts: DecisionFacts,
): string | null {
  return resolveDecision(rules, defaultPort, facts).port;
}

/** Like `evaluateDecision`, but returns the matched rule's domain placement directive alongside the port (Stage 1.x — the placement strangle). */
export function resolveDecision(
  rules: readonly DecisionRule[],
  defaultPort: string | null | undefined,
  facts: DecisionFacts,
): DecisionOutcome {
  for (const rule of rules) {
    if (ruleMatches(rule, facts)) {
      return { port: rule.thenPort, placement: rule.then ?? null };
    }
  }
  return { port: defaultPort ?? null, placement: null };
}
