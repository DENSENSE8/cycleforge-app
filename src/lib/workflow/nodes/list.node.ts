/** `list` — generic, channel-agnostic listing node. */

import { registerNode } from '../registry';
import { stationNode } from './station-node';

registerNode(
  stationNode({
    type: 'list',
    label: 'List (multichannel)',
    icon: 'Tag',
    category: 'fulfill',
    outputs: [{ id: 'listed', label: 'Listed' }],
    port: (input) => (input.event === 'listed' ? 'listed' : null),
    data: (ctx) => ({
      channel: ctx.input.channel ?? null,
      listedBy: ctx.actor.staffId,
    }),
  }),
);
