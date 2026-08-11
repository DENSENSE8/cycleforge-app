/**
 * Every registered table declares HOW a picked row reaches its record plane —
 * and a surface with no plane says why.
 *
 * ## What this is defending
 *
 * "Open a row" had eight implementations across the eighteen registered tables:
 * `DetailStackRailRegistrar` on eight of them, two custom DOM events
 * (`dispatchSelectLine`, `dispatchOpenShippedDetails`), three flavours of
 * `router.push`, a URL param that only highlights the row, a page-local
 * `useState` beside a private panel, and three surfaces where a click did
 * nothing. None of that is visible from the binding, so "this table has no
 * inspector" and "nobody wired one" read identically — and the second is how
 * `WarrantyClaimDetailPanel` shipped a private `w-[420px]` right-edge column
 * for months without anything noticing it was not a `RightRailHost` occupant.
 *
 * So the reason strings are the substance here, not decoration. Three of these
 * surfaces are RULED honest-absence (`NO_DESK_PEEK_SURFACES` in
 * `band3-find-only.guard.test.ts`) and must not grow a peek to make the family
 * look symmetrical; a bare `kind: 'none'` would be a silence with a type
 * annotation on it. Same discipline as `pattern-evolution.md` → Always #6: a
 * guard names the surviving call sites *with their reason*.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { REGISTERED_BINDINGS } from './registered-bindings';

const SRC_ROOT = resolve(import.meta.dirname, '..', '..');

/** Every `*-table-definition.ts` under `src/`, which is where a binding lives. */
function walkTableDefinitionFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walkTableDefinitionFiles(abs, out);
    else if (abs.endsWith('-table-definition.ts')) out.push(abs);
  }
  return out;
}

describe('table record plane', () => {
  /**
   * The hole this closes: the registry registered 18 definitions while the
   * sibling drift guard's hand-typed list held 16, so `inventory.units` and
   * `outbound.csv-import-staging` were checked by nothing. A hand-maintained
   * list of "all of them" is only as good as the assertion that it IS all of
   * them.
   *
   * **It has to walk the DISK.** The first version of this test compared
   * `REGISTERED_BINDINGS` against `TABLE_DEFINITIONS` — which now derives from
   * that same array, so deleting a binding removed it from both sides and the
   * assertion stayed green. It was a test of nothing, and it read exactly like
   * a test of something. The filesystem is the one source of "what bindings
   * exist" that the list cannot silently agree with.
   */
  it('covers every binding that exists on disk', () => {
    const declared = new Set(REGISTERED_BINDINGS.map((b) => b.definition.id));
    const missing: string[] = [];

    for (const file of walkTableDefinitionFiles(SRC_ROOT)) {
      const source = readFileSync(file, 'utf8');
      for (const [, id] of source.matchAll(/^\s*id: '([a-z0-9-]+\.[a-z0-9-]+)',$/gm)) {
        if (!declared.has(id)) missing.push(`${id} (${relative(SRC_ROOT, file)})`);
      }
    }

    assert.deepEqual(
      missing,
      [],
      'a binding exists on disk but is absent from REGISTERED_BINDINGS — it is checked by nothing',
    );
  });

  it('declares a record plane on every binding', () => {
    for (const binding of REGISTERED_BINDINGS) {
      assert.ok(
        binding.recordPlane,
        `${binding.definition.id} declares no recordPlane — say what a picked row opens, or why nothing does`,
      );
    }
  });

  it('an inspector plane names a detail-stack occupant id', () => {
    for (const binding of REGISTERED_BINDINGS) {
      const plane = binding.recordPlane;
      if (plane.kind !== 'inspector') continue;
      assert.match(
        plane.occupantId,
        /^detail:[a-z][a-z0-9-]*$/,
        `${binding.definition.id} occupantId "${plane.occupantId}" is not a RightRailHost id`,
      );
    }
  });

  /**
   * `RightRailHost` keys its `AnimatePresence` on the occupant id, so a
   * per-record id plays exit → empty → enter on every prev/next step. That is
   * legal only where no queue walk exists — and the surface has to say which
   * case it is, because the two are indistinguishable from the id alone.
   */
  it('a per-record occupant id states why it costs no queue walk', () => {
    for (const binding of REGISTERED_BINDINGS) {
      const plane = binding.recordPlane;
      if (plane.kind !== 'inspector' || plane.keyedByRecord === undefined) continue;
      assert.ok(
        plane.keyedByRecord.trim().length > 20,
        `${binding.definition.id} is keyed per record with no stated reason`,
      );
    }
  });

  it('every non-inspector plane states its reason', () => {
    for (const binding of REGISTERED_BINDINGS) {
      const plane = binding.recordPlane;
      if (plane.kind === 'inspector') continue;
      assert.ok(
        plane.reason.trim().length > 20,
        `${binding.definition.id} declares kind "${plane.kind}" with no usable reason — ` +
          'a bare kind is a silence with a type annotation on it',
      );
    }
  });

  /**
   * Honest absence is a claim about a surface, so it is worth being able to
   * read the whole set at once rather than grepping eighteen files. Shrink-only
   * in spirit: a row leaves when that surface genuinely grows a record plane.
   */
  it('the surfaces without a desk peek are the ones we ruled', () => {
    const withoutInspector = REGISTERED_BINDINGS.filter((b) => b.recordPlane.kind !== 'inspector')
      .map((b) => b.definition.id)
      .sort();
    assert.deepEqual(withoutInspector, [
      // Sorted. Three are ruled in `NO_DESK_PEEK_SURFACES`
      // (tracking-exceptions · pickup · catalog); `outbound.ready` refuses
      // `role="button"` outright as append-only history; `tech.all` is a
      // cross-entity feed that routes by row kind.
      'ops.tracking-exceptions',
      'outbound.ready',
      'pickup.browse',
      'products.catalog',
      'tech.all',
    ]);
  });
});
