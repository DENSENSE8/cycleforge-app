/** `repair` — failed-unit rework. */

import { registerNode } from '../registry';
import { stationNode } from './station-node';

registerNode(
  stationNode({
    type: 'repair',
    label: 'Repair',
    icon: 'Wrench',
    category: 'process',
    outputs: [{ id: 'repaired', label: 'Repaired' }],
    port: (input) => (input.event === 'repair_completed' ? 'repaired' : null),
    data: (ctx) => ({
      repairId: ctx.input.repairId ?? null,
      repairedBy: ctx.actor.staffId,
    }),
  }),
);
