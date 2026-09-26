/** `kit_verify` — confirm the box contents against the SKU's kit-parts BOM, between `pack` and `ship`. */

import { registerNode } from '../registry';
import { stationNode } from './station-node';

registerNode(
  stationNode({
    type: 'kit_verify',
    label: 'Verify Kit',
    icon: 'PackageCheck',
    category: 'process',
    outputs: [
      { id: 'verified', label: 'Verified' },
      { id: 'needs_attention', label: 'Needs attention' },
    ],
    port: (input) => {
      if (input.event !== 'pack_verified') return null;
      return input.kitComplete === true ? 'verified' : 'needs_attention';
    },
    data: (ctx) => ({
      kitComplete: ctx.input.kitComplete === true,
      missingRequiredIds: ctx.input.missingRequiredIds ?? [],
      verifiedBy: ctx.actor.staffId,
    }),
  }),
);
