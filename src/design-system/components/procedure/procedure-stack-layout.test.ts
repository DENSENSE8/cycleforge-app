/**
 * Unit tests for procedure deck rem constants.
 *
 * Run: `node --import tsx --test \
 *        src/design-system/components/procedure/procedure-stack-layout.test.ts`
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROCEDURE_STACK_FACE_REM,
  PROCEDURE_STACK_GAP_REM,
} from './procedure-stack-layout';

test('face / gap rem constants are fixed', () => {
  assert.equal(PROCEDURE_STACK_FACE_REM, 2.5);
  assert.equal(PROCEDURE_STACK_GAP_REM, 0.75);
});
