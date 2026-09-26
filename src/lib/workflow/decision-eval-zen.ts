/** decision-eval-zen — GoRules ZEN-backed evaluator behind the `decision` node (UNIFIED-ENGINE-MASTER-PLAN §1.6, Stage 2; gated by… */

import { evaluateDecision, type DecisionFacts, type DecisionRule } from './decision-eval';

/** The fact keys a rule can constrain on — kept in sync with decision-eval.ts. */
const WHEN_KEYS = ['grade', 'channel', 'disposition'] as const;

/** The one primitive we use from the expression-only WASM build. */
type ZenEvaluateExpression = (expression: string, context: unknown) => unknown;

/** Optional pre-authored override. */
interface DecisionZenOptions {
  expression?: string;
}

// ─── Lazy, cached, never-throwing engine handle ────────────────────────────────
let zenLoad: Promise<ZenEvaluateExpression | null> | null = null;

async function loadZen(): Promise<ZenEvaluateExpression | null> {
  if (zenLoad) return zenLoad;
  zenLoad = (async (): Promise<ZenEvaluateExpression | null> => {
    try {
      // Genuine runtime imports — Turbopack's WASM loader expects a split zen_engine_wasm_bg.js + .wasm pair this package does not ship (it uses…
      const zenPkg = ['@gorules/', 'zen-engine-wasm'].join('');
      const mod = (await import(/* webpackIgnore: true */ zenPkg)) as unknown as {
        default: (init: { module_or_path: BufferSource }) => Promise<unknown>;
        evaluateExpression?: ZenEvaluateExpression;
      };
      // wasm-pack --target web build:
      const { createRequire } = await import('node:module');
      const { readFile } = await import('node:fs/promises');
      const { join, dirname } = await import('node:path');
      const require = createRequire(import.meta.url);
      const wasmPath = join(dirname(require.resolve(zenPkg)), 'dist', 'zen_engine_wasm_bg.wasm');
      const bytes = await readFile(wasmPath);
      await mod.default({ module_or_path: bytes });
      const evaluateExpression = mod.evaluateExpression;
      if (typeof evaluateExpression !== 'function') return null;
      return (expression: string, context: unknown) => evaluateExpression(expression, context);
    } catch (err) {
      console.warn(
        '[decision-eval-zen] ZEN WASM unavailable; decision node falls back to the in-house matcher:',
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  })();
  return zenLoad;
}

/**
 * Diagnostics / tests: whether the ZEN WASM engine could be loaded + initialized
 * in this runtime. Lets the parity test skip cleanly when the module isn't
 * loadable (e.g. an environment where the WASM can't instantiate).
 */
export async function isZenAvailable(): Promise<boolean> {
  return (await loadZen()) !== null;
}

// ─── Rule-table → ZEN expression compiler (pure) ───────────────────────────────

/** A safe ZEN string literal. JSON string syntax is a subset ZEN accepts. */
function zenString(value: string): string {
  return JSON.stringify(value);
}

/** One rule's `when` → a ZEN boolean. */
function compileCondition(when: DecisionRule['when']): string {
  const clauses: string[] = [];
  for (const key of WHEN_KEYS) {
    const expected = when?.[key];
    if (expected == null || expected === '') continue; // key not constrained
    clauses.push(`${key} == ${zenString(String(expected))}`);
  }
  return clauses.length ? `(${clauses.join(' and ')})` : 'true';
}

/** Compile the whole table to a first-match-wins ternary chain: */
export function compileDecisionTableToZen(
  rules: readonly DecisionRule[],
  defaultPort: string | null | undefined,
): string {
  let expr = defaultPort == null ? 'null' : zenString(defaultPort);
  for (let i = rules.length - 1; i >= 0; i--) {
    expr = `${compileCondition(rules[i].when)} ? ${zenString(rules[i].thenPort)} : ${expr}`;
  }
  return expr;
}

/**
 * Facts → ZEN context. Coerce present facts to strings (so a numeric grade 3
 * matches a "3" rule, matching decision-eval's String() compare) and null out
 * absent keys (a constrained-but-missing key then fails its equality → no match).
 */
function toZenContext(facts: DecisionFacts): Record<string, string | null> {
  return {
    grade: facts.grade == null ? null : String(facts.grade),
    channel: facts.channel == null ? null : String(facts.channel),
    disposition: facts.disposition == null ? null : String(facts.disposition),
  };
}

/** Normalize the engine result to the node's port contract (string | null). */
function toPort(result: unknown): string | null {
  if (result == null) return null;
  return typeof result === 'string' ? result : String(result);
}

/** ZEN-backed twin of evaluateDecision(). */
export async function evaluateDecisionZen(
  rules: readonly DecisionRule[],
  defaultPort: string | null | undefined,
  facts: DecisionFacts,
  options?: DecisionZenOptions,
): Promise<string | null> {
  const evaluateExpression = await loadZen();
  if (!evaluateExpression) {
    // WASM unavailable → degrade to the in-house matcher (identical result).
    return evaluateDecision(rules, defaultPort, facts);
  }
  try {
    const expression =
      typeof options?.expression === 'string' && options.expression.trim()
        ? options.expression
        : compileDecisionTableToZen(rules, defaultPort);
    return toPort(evaluateExpression(expression, toZenContext(facts)));
  } catch (err) {
    console.warn(
      '[decision-eval-zen] ZEN evaluation failed; falling back to the in-house matcher:',
      err instanceof Error ? err.message : err,
    );
    return evaluateDecision(rules, defaultPort, facts);
  }
}
