/**
 * Guard — the **DESK-PEEK SURFACE LAW**, cited by
 * `table-surface-binding.ts` and, until now, never written.
 *
 * A missing record plane is allowed only when the binding itself carries the
 * reason. The binding is the machine-readable source of truth; this guard must
 * not maintain a second surface list that drifts whenever the registry grows.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REGISTERED_BINDINGS } from './registered-bindings';

describe('desk-peek surface law', () => {
  it('every honest absence carries its ruling on the registered binding', () => {
    for (const binding of REGISTERED_BINDINGS) {
      if (binding.recordPlane.kind !== 'none') continue;
      assert.ok(binding.recordPlane.reason.trim(), `${binding.definition.id} has no record plane and no reason`);
    }
  });
});
