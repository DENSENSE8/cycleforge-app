/**
 * Guard — the **DESK-PEEK SURFACE LAW**, cited by
 * `table-surface-binding.ts` and, until now, never written.
 *
 * That file's docblock says: *"Three of these surfaces are ruled honest-absence
 * and must NOT grow a peek to make the family look symmetrical — the reasons
 * live in `band3-find-only.guard.test.ts`'s `NO_DESK_PEEK_SURFACES`."* A
 * repo-wide search for `*.guard.test.ts` returned zero files, so the list it
 * points at did not exist (`docs/todo/seller-table-program-PLAN.md` §14,
 * wave 1.5).
 *
 * **The count in that prose is stale, and this file is the correction.** Two
 * surfaces are ruled honest-absence today, not three — see the list below. The
 * docblock was written when a third qualified; the enforcement is now the
 * source of truth for how many there are, which is the whole reason to write it
 * down in code rather than in a sentence.
 *
 * ## The law, in both directions
 *
 * Honest absence is a legitimate answer here, and it is a RULING — not a
 * default a surface drifts into:
 *
 * - A surface on this list must stay `kind: 'none'`. Growing a peek "so the
 *   family looks symmetrical" is the pressure the ruling exists to resist.
 * - A surface NOT on this list must not become `kind: 'none'`. That direction
 *   is the one that matters more: a display rebuilt in a hurry can quietly drop
 *   its record plane, and `none` with a plausible sentence reads exactly like a
 *   considered decision. Adding one is a deliberate edit here, with a reason,
 *   reviewed as a ruling.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { REGISTERED_BINDINGS } from './registered-bindings';

/**
 * The surfaces ruled to have NO record plane at all, and why.
 *
 * The reason on the binding is what an agent reads at the mount; this list is
 * what a reviewer reads when someone proposes a fourth. Both must agree — the
 * test below pins that too, so the two cannot drift into a disagreement about
 * why a desk has no peek.
 */
const NO_DESK_PEEK_SURFACES: Readonly<Record<string, string>> = {
  // Append-only `testing_results` rows: there is no version of "this unit
  // passed test" to correct, so there is no record to open. The row's one
  // affordance is the Stage-FBA link, which navigates.
  'outbound.ready': 'Append-only testing history',
  // A personal task is fully expressed by its row — the title edits in cell and
  // the checkbox completes it. A panel would hold a copy of the row.
  'my-day.today': 'A task is fully expressed by its row',
  // An inventory event already happened — there is no record behind the row.
  'inventory.events': 'there is no record behind the row',
};

describe('desk-peek surface law', () => {
  it('exactly the ruled surfaces have no record plane', () => {
    const actual = REGISTERED_BINDINGS.filter((b) => b.recordPlane.kind === 'none')
      .map((b) => b.definition.id)
      .sort();
    assert.deepEqual(
      actual,
      Object.keys(NO_DESK_PEEK_SURFACES).sort(),
      'a surface gained or lost honest-absence without a ruling — see this file',
    );
  });

  it('each ruled surface still declares its own reason at the mount', () => {
    for (const [id, gist] of Object.entries(NO_DESK_PEEK_SURFACES)) {
      const binding = REGISTERED_BINDINGS.find((b) => b.definition.id === id);
      assert.ok(binding, `${id} is ruled honest-absence but is not registered`);
      assert.equal(binding.recordPlane.kind, 'none', `${id} grew a record plane`);
      const reason = (binding.recordPlane as { reason: string }).reason;
      // Not a string match on the whole sentence — that would fail on a
      // legitimate rewording, which is the "pins a literal" mistake the house
      // rules name. The gist is the shared claim; the mount owns the wording.
      assert.ok(
        reason.toLowerCase().includes(gist.toLowerCase()),
        `${id}: the mount's reason no longer states "${gist}"`,
      );
    }
  });

  it('every other registered surface answers a picked row with something', () => {
    for (const binding of REGISTERED_BINDINGS) {
      const id = binding.definition.id;
      if (id in NO_DESK_PEEK_SURFACES) continue;
      assert.notEqual(
        binding.recordPlane.kind,
        'none',
        `${id} dropped its record plane — add it to NO_DESK_PEEK_SURFACES with a reason, or restore the plane`,
      );
    }
  });
});
