/** `decision` — an operator-editable routing fork (Track 1, Stage 1: */

import type { NodeContext, NodeOutputPort, NodeResult } from '../contract';
import {
  parseDecisionRules,
  resolveDecision,
  type DecisionFacts,
} from '../decision-eval';
import { registerNode } from '../registry';
import { isDecisionEngineZen } from '@/lib/feature-flags';

/** Default ports for a freshly dropped, not-yet-configured decision node. */
const DEFAULT_OUTPUTS: NodeOutputPort[] = [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
];

/** Owner-tunable shape. */
export const DECISION_CONFIG_SCHEMA: Record<string, unknown> = {
  type: 'object',
  'x-editor': 'decision-rules',
  properties: {
    outputs: {
      type: 'array',
      title: 'Output ports',
      description: 'The lanes this fork can route to (id + label).',
    },
    rules: {
      type: 'array',
      title: 'Rules',
      description: 'When grade/channel/disposition match, route to a port (first match wins).',
    },
    defaultPort: {
      type: 'string',
      title: 'Default port',
      description: 'Where unmatched items go. Unset → the item parks for a human.',
    },
  },
};

/** Read the declared output ports from config, falling back to the defaults. */
function _configOutputs(config: Record<string, unknown>): NodeOutputPort[] {
  const raw = config.outputs;
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_OUTPUTS;
  return raw
    .map((o) => {
      const id = String((o as Record<string, unknown>)?.id ?? '');
      const label = String((o as Record<string, unknown>)?.label ?? '') || id;
      return { id, label };
    })
    .filter((o) => o.id);
}

/** Read the rule table from config via the shared SoT parser (incl. `then`). */
function configRules(config: Record<string, unknown>) {
  return parseDecisionRules(config.rules);
}

/**
 * Gather routing facts. Decision facts can arrive on the live trigger payload
 * (ctx.input — a scan/verdict) or be accumulated from upstream nodes
 * (ctx.context — e.g. a grade an earlier node recorded). input wins.
 */
function gatherFacts(ctx: NodeContext): DecisionFacts {
  const pick = (key: string): unknown => ctx.input[key] ?? ctx.context[key];
  return {
    grade: pick('grade'),
    channel: pick('channel'),
    disposition: pick('disposition'),
  };
}

registerNode({
  type: 'decision',
  label: 'Decision',
  icon: 'GitBranch',
  category: 'logic',
  // The canvas reads the static registry outputs for the palette chip; a placed
  // node's real ports come from its config (resolved per-instance server-side).
  outputs: DEFAULT_OUTPUTS,
  configSchema: DECISION_CONFIG_SCHEMA,
  async run(ctx: NodeContext): Promise<NodeResult> {
    const rules = configRules(ctx.config);
    const defaultPort =
      typeof ctx.config.defaultPort === 'string' && ctx.config.defaultPort
        ? ctx.config.defaultPort
        : null;

    // In-house resolve always runs:
    const facts = gatherFacts(ctx);
    const outcome = resolveDecision(rules, defaultPort, facts);

    // Stage 2 (§1.6): behind DECISION_ENGINE_ZEN, route through the GoRules ZEN
    // expression engine; default OFF keeps the byte-identical in-house path. The
    // ZEN evaluator self-guards (falls back to in-house on any WASM failure).
    const port = isDecisionEngineZen()
      ? await (await import('../decision-eval-zen')).evaluateDecisionZen(rules, defaultPort, facts)
      : outcome.port;
    if (!port) {
      // No rule matched and no default — park rather than silently drop.
      return { output: 'awaiting', await: true };
    }
    // Surface the placement directive to the action layer via the run context.
    // Route-only rule → no placement → no `data` key (byte-identical to before).
    return outcome.placement
      ? { output: port, data: { placement: outcome.placement } }
      : { output: port };
  },
});
