/** `receiving` — graph entry node. */

import { registerNode } from '../registry';
import { stationNode } from './station-node';

registerNode(
  stationNode({
    type: 'receiving',
    label: 'Receive',
    icon: 'PackageOpen',
    category: 'intake',
    outputs: [{ id: 'received', label: 'Received' }],
    port: (input) => (input.event === 'unit_received' ? 'received' : null),
    data: (ctx) => ({
      receivingLineId: ctx.input.receivingLineId ?? null,
      receivedBy: ctx.actor.staffId,
    }),
  }),
);
