/** `inspection` — test + condition-grade bench. */

import { registerNode } from '../registry';
import { stationNode } from './station-node';

registerNode(
  stationNode({
    type: 'inspection',
    label: 'Test / Grade',
    icon: 'ClipboardCheck',
    category: 'process',
    outputs: [
      { id: 'pass', label: 'Pass' },
      { id: 'fail', label: 'Fail' },
    ],
    port: (input) => {
      if (input.event !== 'test_verdict') return null;
      if (input.verdict === 'PASS') return 'pass';
      if (input.verdict === 'TESTING_FAILED') return 'fail';
      return null; // TEST_AGAIN — re-queued, still at the bench
    },
    data: (ctx) => ({
      verdict: ctx.input.verdict,
      testedBy: ctx.actor.staffId,
    }),
  }),
);
