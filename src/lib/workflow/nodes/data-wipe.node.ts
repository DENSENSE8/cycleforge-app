/** `data_wipe` — secure data erasure / factory reset bench. */

import { registerNode } from '../registry';
import { stationNode } from './station-node';

registerNode(
  stationNode({
    type: 'data_wipe',
    label: 'Data Wipe',
    icon: 'ShieldCheck',
    category: 'process',
    outputs: [
      { id: 'wiped', label: 'Wiped' },
      { id: 'failed', label: 'Wipe failed' },
    ],
    port: (input) => {
      if (input.event !== 'data_wiped') return null;
      return input.wipeSuccess === true ? 'wiped' : 'failed';
    },
    data: (ctx) => ({
      wipeSuccess: ctx.input.wipeSuccess === true,
      // Erasure method (e.g. 'factory_reset' | 'secure_erase' | 'crypto_erase')
      // and an optional certificate/audit ref, threaded by the station action.
      wipeMethod: ctx.input.wipeMethod ?? null,
      wipeCertRef: ctx.input.wipeCertRef ?? null,
      wipedBy: ctx.actor.staffId,
    }),
  }),
);
