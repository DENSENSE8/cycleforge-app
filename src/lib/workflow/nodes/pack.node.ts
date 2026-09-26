/** `pack` — allocation → pick → pack bench. */

import { registerNode } from '../registry';
import { stationNode } from './station-node';

registerNode(
  stationNode({
    type: 'pack',
    label: 'Pack',
    icon: 'Package',
    category: 'fulfill',
    outputs: [{ id: 'packed', label: 'Packed' }],
    port: (input) => (input.event === 'packed' ? 'packed' : null),
    data: (ctx) => ({
      shipmentId: ctx.input.shipmentId ?? null,
      packedBy: ctx.actor.staffId,
    }),
  }),
);
