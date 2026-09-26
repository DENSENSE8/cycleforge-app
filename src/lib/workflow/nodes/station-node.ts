/** stationNode — the factory behind every built-in floor node. */

import type { NodeContext, NodeDefinition, NodeOutputPort, NodeResult } from '../contract';

/** Owner-tunable knobs every station node exposes (no secrets here, ever). */
const STATION_CONFIG_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    slaHours: {
      type: 'number',
      title: 'SLA hours',
      description: 'Flag units that sit at this step longer than this.',
    },
    station: {
      type: 'string',
      title: 'Station',
      description: 'Operations-catalog station key this step runs at.',
    },
    trigger: {
      type: 'string',
      title: 'Top bar',
      description:
        'How operators start work here: a focus-locked scan bar, or a recent-activity feed only (no scan entry / top banner).',
      options: [
        { value: 'scan', label: 'Scan bar' },
        { value: 'feed', label: 'Feed only (no scan)' },
      ],
      default: 'scan',
    },
  },
};

/** The trigger-slot modes a station node can render its top bar as. */
type StationTrigger = 'scan' | 'feed';

/**
 * Read the configured trigger mode off a station node's config bag, defaulting
 * to 'scan' (today's hardcoded behavior) for any node that hasn't set it.
 * Single source of truth so the Inspector knob and the station UI never drift.
 */
function stationTrigger(config: Record<string, unknown> | null | undefined): StationTrigger {
  return config?.trigger === 'feed' ? 'feed' : 'scan';
}

interface StationNodeOpts {
  type: string;
  label: string;
  icon: string;
  category: NodeDefinition['category'];
  outputs: NodeOutputPort[];
  /**
   * Map a tap's input (event + payload) to an output port id, or null to
   * keep waiting at this node.
   */
  port: (input: Record<string, unknown>) => string | null;
  /** Optional context patch recorded when the node fires (for downstream nodes). */
  data?: (ctx: NodeContext) => Record<string, unknown>;
}

export function stationNode(opts: StationNodeOpts): NodeDefinition {
  return {
    type: opts.type,
    label: opts.label,
    icon: opts.icon,
    category: opts.category,
    outputs: opts.outputs,
    configSchema: STATION_CONFIG_SCHEMA,
    async run(ctx): Promise<NodeResult> {
      const output = opts.port(ctx.input);
      if (!output) {
        // Not this node's event (or a human is mid-step) — park, don't route.
        return { output: 'awaiting', await: true };
      }
      return { output, data: opts.data?.(ctx) };
    },
  };
}
