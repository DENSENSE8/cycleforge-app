/**
 * ONE TABLE ENGINE — the mechanical half of {@link TABLE_ENGINE_LAW}.
 *
 * Every invariant that a grep can prove is proved here, and the ones it cannot
 * are named in the law module as text an agent must read. The split is
 * deliberate: a law with no check is a comment, and this repo has already paid
 * for comments that described behaviour nothing enforced.
 *
 * The shape is a RATCHET, not a gate. Today's forks are enumerated as debt and
 * the assertion is that the set may never grow — so the law lands green, a new
 * fork fails immediately, and every migration removes a line. A law that failed
 * the build on the day it landed would be suppressed instead of obeyed.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  ADMIN_TABLE_DEBT,
  HAND_HTML_TABLE_ALLOW,
  HAND_HTML_TABLE_DEBT,
  COMPOUND_SKELETON_FILTER_DEBT,
  ENGINE_OWNED_SEAMS,
  FORBIDDEN_LANE_KEY_LISTS,
  REVERSIBLE_VERB_PROOF,
  TABLE_ENGINE_ACCEPTANCE,
  TABLE_ENGINE_LAW,
  VERB_CATALOG_MODULES,
  VERB_DECLARATION_DEBT,
} from '@/lib/tables/table-engine-law';

const REPO = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const SOURCES = walk(path.join(REPO, 'src')).map((f) => path.relative(REPO, f));

function read(file: string): string {
  return readFileSync(path.join(REPO, file), 'utf8');
}

/**
 * The file with its comments removed.
 *
 * A "this name must not come back" grep has to look at CODE, or every docblock
 * that explains why the name was deleted trips it — which is how a law ends up
 * punishing the person who wrote the law down.
 */
function code(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * A file DECLARES verbs when it builds `SelectionAction` objects — not when it
 * merely types a prop or a store. The three markers are how every current
 * declaration is written; a fourth spelling would slip past, which is why the
 * law module also states the rule in words for the agent that writes it.
 */
const DECLARES_VERBS = /useMemo<SelectionAction|satisfies SelectionAction|:\s*SelectionAction<[^>]*>\s*=\s*\{/;

describe('one table engine — verbs bind to fields, not to pages', () => {
  it('only family CATALOGS declare verbs; the fork set never grows', () => {
    const declaring = SOURCES.filter((file) => DECLARES_VERBS.test(read(file))).sort();
    const allowed = new Set<string>([
      ...VERB_CATALOG_MODULES,
      ...VERB_DECLARATION_DEBT.map((d) => d.file),
    ]);
    const rogue = declaring.filter((file) => !allowed.has(file));
    assert.deepEqual(
      rogue,
      [],
      `these mint verbs outside a family catalog — bind a key instead of declaring one:\n${rogue.join('\n')}`,
    );
  });

  it('the debt list is real — every named fork still exists, and is still a fork', () => {
    // A ratchet only ratchets if stale entries are removed. An id that no longer
    // declares verbs has been migrated, and holding its line would let the NEXT
    // fork take the slot silently.
    for (const { file } of VERB_DECLARATION_DEBT) {
      assert.ok(
        DECLARES_VERBS.test(read(file)),
        `${file} no longer declares verbs — delete it from VERB_DECLARATION_DEBT (the ratchet only counts down)`,
      );
    }
  });

  it('every debt entry says WHY, so the next agent can finish it', () => {
    for (const entry of VERB_DECLARATION_DEBT) {
      assert.ok(entry.why.length > 40, `${entry.file}: name the fork, not just the file`);
    }
  });

  it('a catalog module is a real file — the allowlist cannot rot', () => {
    for (const file of VERB_CATALOG_MODULES) {
      assert.ok(read(file).length > 0, `${file} is listed as a verb catalog but does not exist`);
    }
  });
});

describe('one table engine — verbs bind to fields, not to lanes', () => {
  it('no per-lane action key list survives anywhere under src/', () => {
    // The fork this invariant killed on 2026-09-05: `orderBulkActionKeys(view)`
    // returned a different verb array per lane and the catalog gated every verb
    // on `laneActionKeys.has(key)`. The lifecycle distinction it encoded is
    // real, but it is a fact about the ROW, and it now lives in
    // `@/lib/selection/order-verb-state` as predicates. A grep is the whole
    // check: these names must not come back in any spelling.
    for (const name of FORBIDDEN_LANE_KEY_LISTS) {
      const offenders = SOURCES.filter(
        // The law module names them in order to forbid them; everywhere else,
        // the name appearing in CODE is the fork itself.
        (file) => file !== 'src/lib/tables/table-engine-law.ts' && code(file).includes(name),
      ).sort();
      assert.deepEqual(
        offenders,
        [],
        `${name} is a per-lane verb list — bind the verb to the FIELD it writes and read direction off the row:\n${offenders.join('\n')}`,
      );
    }
  });

  it('the engine can express a field-bound, reversible verb at all', () => {
    // A law the type system cannot express is a comment. `writesField` is where
    // a verb names its fact; `direction` is where it reads the row instead of
    // the route; `offeredSelectionActions` is the replacement for the lane list.
    const engine = read('src/lib/selection/selection-actions.tsx');
    assert.match(engine, /writesField\?: string/, 'SelectionAction must carry the field it writes');
    assert.match(engine, /direction\?: \(row: T\) => VerbDirection/, 'direction is per ROW');
    assert.match(engine, /export function offeredSelectionActions/, 'the offered set is derived, not listed');
  });

  it('the reversible verb is declared ONCE, with its field and its direction', () => {
    const catalog = read(REVERSIBLE_VERB_PROOF.module);
    const declarations = catalog.split(`key: '${REVERSIBLE_VERB_PROOF.verb}'`).length - 1;
    assert.equal(
      declarations,
      1,
      `${REVERSIBLE_VERB_PROOF.verb} must be declared exactly once — two declarations is the fork wearing two labels`,
    );
    assert.ok(
      catalog.includes(`writesField: '${REVERSIBLE_VERB_PROOF.writesField}'`),
      `${REVERSIBLE_VERB_PROOF.verb} must name the field it writes`,
    );
    assert.match(catalog, /direction: scanOutDirection/, 'direction comes from row state');

    // …and no OTHER selection-verb declarer may grow an undo twin. Scoped to
    // files that declare `SelectionAction`s on purpose: the handheld station
    // tape (`MobileScanOut`) paints its own "Undo scan-out" button, and that is
    // a different plane — an undo-the-last-scan affordance on a scan station,
    // not a table selection verb. It is named here rather than failed, because
    // widening this grep to every string in `src/` catches docblocks and other
    // people's surfaces instead of the fork.
    const twins = SOURCES.filter(
      (file) =>
        file !== REVERSIBLE_VERB_PROOF.module &&
        DECLARES_VERBS.test(read(file)) &&
        /Undo scan-?out/i.test(read(file)),
    ).sort();
    assert.deepEqual(
      twins,
      [],
      `a second "Undo scan-out" SELECTION verb is the fork wearing two labels:\n${twins.join('\n')}`,
    );
  });

  it('direction is never read from the route', () => {
    // The tell: a verb catalog branching on the lane it happens to be mounted
    // under. `orderView` may still pick the delete path and the export filename
    // — it must not pick VERBS.
    const catalog = read(REVERSIBLE_VERB_PROOF.module);
    assert.ok(
      !/enabled:\s*\(\)\s*=>\s*\w*[Ll]ane/.test(catalog),
      'a verb gated on a lane set is the fork this law refuses',
    );
  });
});

describe('one table engine — the descriptor carries data, not behavior', () => {
  it('the shared geometry has no per-family override hook', () => {
    // `compoundColumnsFor<C>()` takes NO arguments by construction: a width or
    // label parameter is the door a layout difference walks back in through.
    const source = read('src/components/tables/compound/compound-columns.ts');
    assert.match(
      source,
      /export function compoundColumnsFor<C extends \{ key: string \}>\(\): readonly C\[\]/,
      'compoundColumnsFor grew a parameter — that is the override hook the law refuses',
    );
  });

  it('no NEW mount strips Dates/select/thumb off the shared skeleton', () => {
    const dropChrome = /key !== ['"](?:dates|select|thumb|item|state|fulfillment)['"]/;
    const usesCompound = /compoundColumnsFor/;
    const offenders = SOURCES.filter(
      (file) => usesCompound.test(read(file)) && dropChrome.test(code(file)),
    ).sort();
    const allowed = new Set(COMPOUND_SKELETON_FILTER_DEBT.map((d) => d.file));
    const rogue = offenders.filter((file) => !allowed.has(file));
    assert.deepEqual(
      rogue,
      [],
      `these cut chrome tracks off compoundColumnsFor — un-filter or name them in COMPOUND_SKELETON_FILTER_DEBT:\n${rogue.join('\n')}`,
    );
    for (const { file, why } of COMPOUND_SKELETON_FILTER_DEBT) {
      assert.ok(existsSync(path.join(REPO, file)), `${file} gone — delete it from COMPOUND_SKELETON_FILTER_DEBT`);
      assert.ok(offenders.includes(file), `${file} no longer filters the skeleton — delete the debt row (${why})`);
      assert.ok(why.length > 20, `${file} debt must say why`);
    }
  });

  it('field catalogs do not revive the Amount COLUMN slot kind', () => {
    const catalogDir = path.join(REPO, 'src/lib/tables/field-catalog');
    const catalogFiles = readdirSync(catalogDir)
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'types.ts')
      .map((name) => `src/lib/tables/field-catalog/${name}`);
    const revived = catalogFiles.filter((file) =>
      /slotKinds:\s*\[[^\]]*amount/.test(code(file)),
    );
    assert.deepEqual(
      revived,
      [],
      `these catalogs still allow slotKinds amount (the Amount column door):\n${revived.join('\n')}`,
    );
  });

  it('settings/admin compound key unions do not keep a dead amount track', () => {
    // Copy-paste of the deleted skeleton: state · amount · (actions) · _fill.
    // OrdersQueueColumnKey may still name amount as a LEGACY sort/URL key later
    // in the union — that is bookmark compat, not a chrome track.
    const paste = /'state'\s*\|\s*'amount'\s*\|\s*(?:'actions'\s*\|\s*)?'_fill'/;
    const offenders = SOURCES.filter((file) => paste.test(code(file))).sort();
    assert.deepEqual(
      offenders,
      [],
      `these still type amount as a compound chrome track (copy-paste of the deleted skeleton):\n${offenders.join('\n')}`,
    );
  });

  it('every compound spreadsheet passes subtitleFieldIds so under-title facts paint', () => {
    const callers = SOURCES.filter(
      (file) =>
        file !== 'src/components/tables/useCompoundSpreadsheet.tsx' &&
        /useCompoundSpreadsheet\s*</.test(read(file)),
    ).sort();
    assert.ok(callers.length > 0, 'expected useCompoundSpreadsheet callers');
    const missing = callers.filter((file) => !/\bsubtitleFieldIds\b/.test(read(file)));
    assert.deepEqual(
      missing,
      [],
      `these mount the spreadsheet without layout subtitleFieldIds — under-title bindings will not paint:\n${missing.join('\n')}`,
    );
  });

  it('AdminTable mounts never grow — remaining sites are named debt', () => {
    const mounts = SOURCES.filter((file) =>
      /from ['"]@\/design-system\/components\/AdminTable['"]/.test(read(file)),
    ).sort();
    const allowed = new Set(ADMIN_TABLE_DEBT.map((d) => d.file));
    const rogue = mounts.filter((file) => !allowed.has(file));
    assert.deepEqual(
      rogue,
      [],
      `new AdminTable mount — a second table engine. Port it or name it in ADMIN_TABLE_DEBT:\n${rogue.join('\n')}`,
    );
    for (const { file, why } of ADMIN_TABLE_DEBT) {
      assert.ok(existsSync(path.join(REPO, file)), `${file} gone — delete it from ADMIN_TABLE_DEBT`);
      assert.ok(mounts.includes(file), `${file} no longer imports AdminTable — delete the debt row`);
      assert.ok(why.length > 40, `${file}: name the fork, not just the file`);
    }
  });

  it('raw HTML product tables never grow — remaining sites are named debt', () => {
    const hits = SOURCES.filter((file) => /<table\b/.test(code(file))).sort();
    const allowed = new Set<string>([
      ...HAND_HTML_TABLE_DEBT.map((d) => d.file),
      ...HAND_HTML_TABLE_ALLOW,
    ]);
    const rogue = hits.filter((file) => !allowed.has(file));
    assert.deepEqual(
      rogue,
      [],
      `new hand HTML table — a second table engine. Port it or name it in HAND_HTML_TABLE_DEBT / ALLOW:\n${rogue.join('\n')}`,
    );
    for (const { file, why } of HAND_HTML_TABLE_DEBT) {
      assert.ok(existsSync(path.join(REPO, file)), `${file} gone — delete it from HAND_HTML_TABLE_DEBT`);
      assert.ok(hits.includes(file), `${file} no longer paints a <table> — delete the debt row`);
      assert.ok(why.length > 40, `${file}: name the fork, not just the file`);
    }
    for (const file of HAND_HTML_TABLE_ALLOW) {
      assert.ok(existsSync(path.join(REPO, file)), `${file} gone — delete it from HAND_HTML_TABLE_ALLOW`);
      assert.ok(hits.includes(file), `${file} no longer paints a <table> — delete the allow row`);
    }
  });

  it('GridColumnKey sortable lists do not revive the Amount track', () => {
    // Only the array literal — bookmark aliases like TRACK_SORT_FACTS
    // `amount: 'price'` stay (URL `?sort=amount`).
    const offenders = SOURCES.filter((file) =>
      /GRID_SORTABLE_KEYS(?:\s*:\s*readonly \w+\[\])?\s*=\s*\[(?:(?!\])[\s\S])*'amount'/.test(
        code(file),
      ),
    ).sort();
    assert.deepEqual(
      offenders,
      [],
      `these still list amount as a clickable column key after the Amount track died:\n${offenders.join('\n')}`,
    );
  });

  it('no mount filters amount off the skeleton — COMPOUND_TRACKS has none', () => {
    // The 2026-09-04 Orders-only `c.key !== 'amount'` drop is the hole that
    // left Unbox with a green Amount column. Settings/admin copies of that
    // filter are the same fork. Line money is a subtitle; do not pretend the
    // chrome still carries an amount track.
    const offenders = SOURCES.filter((file) => /c\.key !== ['"]amount['"]/.test(code(file))).sort();
    assert.deepEqual(
      offenders,
      [],
      `these still drop an Amount track the engine no longer has:\n${offenders.join('\n')}`,
    );
  });

  it('the compound cell does not paint an Amount track', () => {
    const cell = read('src/components/tables/compound/CompoundGridCell.tsx');
    const bodies = read('src/components/tables/compound/CompoundCells.tsx');
    assert.doesNotMatch(cell, /CompoundAmount/);
    assert.doesNotMatch(cell, /key === ['"]amount['"]/);
    assert.doesNotMatch(cell, /case ['"]amount['"]/);
    assert.doesNotMatch(bodies, /export function CompoundAmount/);
  });

  it('the compound view model stays strings and enums — no JSX crosses the seam', () => {
    // The adapter boundary is where polymorphism is resolved. A ReactNode on
    // the view model lets a family smuggle bespoke markup into the shared row,
    // which is the fork wearing a view model.
    const model = read('src/components/tables/compound/compound-row-model.ts');
    assert.ok(
      !/ReactNode|JSX\.Element/.test(model),
      'compound-row-model.ts references a React node type — the view model must stay presentational data',
    );
  });
});

describe('one table engine — the law is quotable and complete', () => {
  it('every invariant carries text an agent can act on', () => {
    for (const [id, text] of Object.entries(TABLE_ENGINE_LAW)) {
      assert.ok(text.length > 80, `${id}: the law must state the rule, not name it`);
    }
  });

  it('names the seams a new table must not re-implement', () => {
    assert.ok(ENGINE_OWNED_SEAMS.length >= 5);
    assert.match(TABLE_ENGINE_ACCEPTANCE, /zero new \.tsx files/);
  });
});
