/**
 * Guard — the registry **COVERAGE ASSERTION**, cited in
 * `registered-bindings.ts` and, until now, never written.
 *
 * That file's docblock says: *"One list, derived both ways, plus a coverage
 * assertion in `table-record-plane.guard.test.ts` that the registry and this
 * array name the same set. A hand-maintained 'all of them' is only as good as
 * the assertion that it is all of them."* A repo-wide search for
 * `*.guard.test.ts` returned zero files, so the prose was there and the
 * enforcement was not (`docs/todo/seller-table-program-PLAN.md` §14, wave 1.5).
 *
 * ## What this file is for
 *
 * Two things the binding waist promises and nothing checked:
 *
 * 1. **Coverage.** `REGISTERED_BINDINGS` and the definition registry name the
 *    same set. The registry now derives from the array, so this is cheap — but
 *    it is exactly the invariant whose absence let two surfaces escape the
 *    drift check, and deriving is a choice a later refactor can undo.
 * 2. **Every binding declares what a picked row opens, out loud.** The
 *    `recordPlane` union's whole point is that the non-`inspector` arms carry a
 *    REASON: *"a bare `kind: 'none'` would be a silence with a type
 *    annotation."* A type can require the field; only a test can require it to
 *    say something.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REGISTERED_BINDINGS } from './registered-bindings';
import { TABLE_DEFINITIONS, tableDefinitionIds } from './table-definition-registry';

/** A reason that is present but empty is the silence this guard exists to catch. */
function assertRealReason(reason: string, id: string, kind: string): void {
  assert.equal(typeof reason, 'string', `${id}: ${kind} reason must be a string`);
  assert.ok(reason.trim().length >= 20, `${id}: ${kind} reason is too thin to be a reason`);
}

describe('registered bindings — coverage', () => {
  it('the registry and the bindings array name the same set', () => {
    const fromBindings = [...REGISTERED_BINDINGS.map((b) => b.definition.id)].sort();
    assert.deepEqual(tableDefinitionIds(), fromBindings);
    assert.equal(Object.keys(TABLE_DEFINITIONS).length, REGISTERED_BINDINGS.length);
  });

  it('every binding carries its own definition object, not a lookalike', () => {
    // Identity, not deep equality: a binding that rebuilt its definition would
    // pass a shape check and still be a second declaration of one table.
    for (const binding of REGISTERED_BINDINGS) {
      assert.equal(
        TABLE_DEFINITIONS[binding.definition.id],
        binding.definition,
        `${binding.definition.id}: the registry holds a different definition object`,
      );
    }
  });

  it('table ids are unique — two bindings must never share a prefs bucket', () => {
    const tableIds = REGISTERED_BINDINGS.map((b) => b.definition.tableId);
    const dupes = tableIds.filter((t, i) => tableIds.indexOf(t) !== i);
    assert.deepEqual([...new Set(dupes)], [], 'two bindings share one tableId');
  });
});

describe('registered bindings — every row says what it opens', () => {
  for (const binding of REGISTERED_BINDINGS) {
    const id = binding.definition.id;
    const plane = binding.recordPlane;

    it(`${id}: declares a record plane, and a non-inspector arm states why`, () => {
      assert.ok(plane, `${id}: no record plane declared`);
      switch (plane.kind) {
        case 'inspector':
          assert.ok(
            plane.occupantId.startsWith('detail:'),
            `${id}: an inspector occupant id must be prefixed \`detail:\``,
          );
          // A per-record occupant id replays the rail's exit→enter on every
          // prev/next step, so it is tolerable only on a surface with no queue
          // walk — and saying so is what keeps it a decision.
          if (plane.keyedByRecord !== undefined) {
            assertRealReason(plane.keyedByRecord, id, 'keyedByRecord');
          }
          break;
        case 'station':
        case 'navigate':
        case 'dialog':
        case 'none':
          assertRealReason(plane.reason, id, plane.kind);
          break;
        default: {
          const never: never = plane;
          assert.fail(`${id}: unhandled record plane ${JSON.stringify(never)}`);
        }
      }
    });
  }
});
