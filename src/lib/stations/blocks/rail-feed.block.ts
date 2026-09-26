/** Rail-feed block — a read-oriented worklist rail for the queue slot. */

import { registerBlock } from './registry';

let registered = false;
export function registerRailFeedBlock(): void {
  if (registered) return;
  registered = true;
  registerBlock({
    type: 'rail_feed',
    label: 'Worklist rail',
    icon: 'List',
    category: 'list',
    slots: ['queue'],
    accepts: 'rows',
    roles: [
      { key: 'title', label: 'Title', kind: 'text', required: true },
      { key: 'ref', label: 'Reference (PO / tracking / SKU…)' },
      { key: 'meta', label: 'Meta line' },
    ],
    configSchema: [
      { key: 'empty_text', label: 'Empty-state text', kind: 'text', default: 'Nothing in the queue.' },
      {
        key: 'show_count',
        label: 'Show count',
        kind: 'toggle',
        default: true,
      },
    ],
    requiredPermissions: [],
    component: () => import('@/components/stations/blocks/RailFeedBlock').then((m) => m.RailFeedBlock),
  });
}
