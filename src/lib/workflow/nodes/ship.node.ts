/** `ship` — carrier handoff, the graph's terminal step. */

import { registerNode } from '../registry';
import { stationNode } from './station-node';

registerNode(
  stationNode({
    type: 'ship',
    label: 'Ship',
    icon: 'Truck',
    category: 'fulfill',
    outputs: [{ id: 'shipped', label: 'Shipped' }],
    port: (input) => (input.event === 'shipped' ? 'shipped' : null),
    data: (ctx) => ({
      trackingNumber: ctx.input.trackingNumber ?? null,
    }),
  }),
);
