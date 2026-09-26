/** `returns` — returns / warranty intake-and-triage. */

import { registerNode } from '../registry';
import { stationNode } from './station-node';

registerNode(
  stationNode({
    type: 'returns',
    label: 'Returns / Warranty',
    icon: 'RotateCcw',
    category: 'intake',
    outputs: [
      { id: 'restock', label: 'Restock' },
      { id: 'rtv', label: 'Return to vendor' },
      { id: 'scrap', label: 'Scrap / parts' },
    ],
    port: (input) => {
      if (input.event !== 'return_received') return null;
      const d = String(input.disposition ?? '').toLowerCase();
      if (d === 'restock' || d === 'rtv' || d === 'scrap') return d;
      return null;
    },
    data: (ctx) => ({
      disposition: ctx.input.disposition ?? null,
      rmaRef: ctx.input.rmaRef ?? null,
      returnReason: ctx.input.returnReason ?? null,
      triagedBy: ctx.actor.staffId,
    }),
  }),
);
