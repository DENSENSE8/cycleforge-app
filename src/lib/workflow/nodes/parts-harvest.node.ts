/** `parts_harvest` — scrap/harvest landing node. */

import { registerNode } from '../registry';
import type { NodeContext, NodeResult } from '../contract';

const TERMINAL_OUTPUT = 'arrived';

registerNode({
  type: 'parts_harvest',
  label: 'Scrap / Parts Harvest',
  icon: 'Recycle',
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
