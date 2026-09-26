/** `rtv` — return-to-vendor landing node. */

import { registerNode } from '../registry';
import type { NodeContext, NodeResult } from '../contract';

const TERMINAL_OUTPUT = 'arrived';

registerNode({
  type: 'rtv',
  label: 'Return to Vendor',
  icon: 'Undo2',
  category: 'process',
  outputs: [{ id: TERMINAL_OUTPUT, label: 'Arrived' }],
  async run(ctx: NodeContext): Promise<NodeResult> {
    return {
      output: TERMINAL_OUTPUT,
      data: {
        rmaRef: ctx.input.rmaRef ?? null,
        returnReason: ctx.input.returnReason ?? null,
      },
    };
  },
});
