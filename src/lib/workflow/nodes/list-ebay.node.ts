/** `list_ebay` — channel listing step (the first of the interchangeable channel nodes; each platform gets its own type behind the same… */

import { registerNode } from '../registry';
import { stationNode } from './station-node';

registerNode(
  stationNode({
    type: 'list_ebay',
    label: 'List on eBay',
    icon: 'Tag',
    category: 'fulfill',
    outputs: [{ id: 'listed', label: 'Listed' }],
    port: (input) => (input.event === 'listed' ? 'listed' : null),
    data: (ctx) => ({ listingId: ctx.input.listingId ?? null }),
  }),
);
