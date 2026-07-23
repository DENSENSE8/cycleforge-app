/**
 * Support ticket id face — last-4, no `#`.
 *
 *   node --import tsx --test src/lib/support/ticket-id-face.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { supportTicketIdFace } from './ticket-refs';

test('supportTicketIdFace strips # and shows last 4', () => {
  assert.deepEqual(supportTicketIdFace('#9591'), { value: '9591', display: '9591' });
  assert.deepEqual(supportTicketIdFace('#11398708465716255'), {
    value: '11398708465716255',
    display: '6255',
  });
  assert.deepEqual(supportTicketIdFace('175'), { value: '175', display: '175' });
});
