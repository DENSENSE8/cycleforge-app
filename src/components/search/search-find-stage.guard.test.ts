import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * `/search` centered find stage — no context rail; sole-hit → `?sel=`;
 * multi-hit browse under the bar via SearchResultsSurface.
 */

const ROOT = process.cwd();

/**
 * Every assertion below reads CODE, never prose. Half of them are bans
 * (`backdrop-blur`, `rounded-full`, `shadow-sm`), and a file documenting the
 * shape it was migrated OFF names those strings in its own comments — so an
 * un-stripped read fails the surface for explaining itself, and the next person
 * deletes the comment or mutes the test. Same trap as the carton guard's
 * `MODEL.includes('import')` firing on `sourcing_import`.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

const stage = read('src/components/search/SearchFindStage.tsx');
const page = read('src/app/search/page.tsx');
const header = read('src/components/layout/GlobalHeaderSearch.tsx');
const combobox = read('src/components/search/GlobalFindCombobox.tsx');
const backdrop = read('src/components/search/SearchStageBackground.tsx');
const dropdown = read('src/components/search/GlobalSearchDropdown.tsx');
const appSurfaceFill = read('src/design-system/components/AppSurfaceFill.tsx');

test('SearchFindStage is the no-sel /search surface (page mounts it)', () => {
  assert.match(page, /SearchFindStage/);
  assert.match(page, /if \(!sel\)/);
  // Empty-land silent restore must stay deleted (ref + effect, not doc copy).
  assert.doesNotMatch(page, /autoReranRef|recents\[0\]\?\.query/);
});

test('stage uses GlobalFindCombobox presentation=stage + soleHitSel', () => {
  assert.match(stage, /presentation="stage"/);
  assert.match(stage, /soleHitSel/);
  assert.match(stage, /SearchResultsSurface/);
  assert.match(stage, /SearchRefineControls/);
  assert.match(stage, /ownsFocusEvent/);
});

test('header defers expand to stage when /search has no sel', () => {
  assert.match(header, /deferExpand=\{deferToStage\}/);
  assert.match(header, /dispatchGlobalSearchFocus/);
  assert.match(header, /ownsFocusEvent=\{!deferToStage\}/);
});

test('GlobalFindCombobox exposes chrome and stage presentations', () => {
  assert.match(combobox, /type GlobalFindPresentation = 'chrome' \| 'stage'/);
  assert.match(combobox, /presentation === 'stage'/);
  // Must not bind the ⌘K chord (arrow/Escape keydown on the input is fine).
  assert.doesNotMatch(combobox, /e\.key\s*===\s*['"]k['"]/i);
});

test('stage mounts SearchStageBackground as an independent backdrop', () => {
  assert.match(stage, /SearchStageBackground/);
  assert.match(backdrop, /AppSurfaceFill/);
  assert.match(backdrop, /tone="canvas"/);
  // Non-interactive fill contract lives on AppSurfaceFill (composed, not retyped).
  assert.match(appSurfaceFill, /pointer-events-none absolute inset-0/);
  assert.match(appSurfaceFill, /aria-hidden/);
});

test('stage elevates browse results with elevationClass(raised), not shadow-sm', () => {
  assert.match(stage, /elevationClass\(['"]raised['"]\)/);
  assert.doesNotMatch(stage, /shadow-sm/);
});

/**
 * The stage's browse list is the field's own extension (2026-08-05).
 *
 * `GlobalSearchDropdown` was migrated off the glass bubble and pinned below —
 * `rounded-none`, `border-t-0`, `gap={0}`, `matchWidth`, no `backdrop-blur`, no
 * `cornerClass(`. The stage does the SAME JOB (a result list hanging off a find
 * field) and was never brought along: it sat 16px lower, rounded, translucent,
 * and 35rem wide under a 24rem opaque square field. Three mismatches at once is
 * why one act read as two floating islands.
 */
test('stage browse list is a flush extension of the field, not a glass bubble', () => {
  assert.match(stage, /rounded-none/);
  assert.match(stage, /border-t-0/);
  assert.doesNotMatch(stage, /backdrop-blur/);
  assert.doesNotMatch(stage, /cornerClass\(/);
  // A translucent card fill (`bg-surface-card/80`) is the bubble's other half.
  assert.doesNotMatch(stage, /bg-surface-card\/\d/);
});

test('the stage field owns the column width; the fixed cell is header-only', () => {
  assert.match(
    combobox,
    /h-8 w-full border border-border-soft bg-surface-card/,
    'the stage field must span its host column — a fixed width floats it above the browse list',
  );
  assert.equal(
    combobox.match(/GLOBAL_FIND_FIELD_WIDTH/g)?.length ?? 0,
    2,
    'the 24rem cell belongs to header chrome only (one definition + one use)',
  );
});

test('stage presentation raises the find field with elevationClass', () => {
  assert.match(combobox, /elevationClass\(['"]raised['"]\)/);
  assert.match(combobox, /bg-surface-card/);
  // Square stage block — never a consumer pill.
  assert.doesNotMatch(combobox, /rounded-full/);
});

test('chrome find cell is flush (no pill, no gray bubble)', () => {
  assert.match(combobox, /rounded-none/);
  assert.match(combobox, /border-x/);
  assert.match(combobox, /border-border-hairline/);
  assert.match(combobox, /bg-transparent/);
  assert.doesNotMatch(combobox, /rounded-full/);
});

test('GlobalSearchDropdown is a flush header extension, not a glass bubble', () => {
  assert.match(dropdown, /rounded-none/);
  assert.match(dropdown, /border-t-0/);
  assert.match(dropdown, /placement="bottom-stretch"/);
  assert.match(dropdown, /gap=\{0\}/);
  assert.match(dropdown, /matchWidth/);
  assert.match(dropdown, /elevationClass\(['"]raised['"],\s*['"]soft['"]\)/);
  assert.doesNotMatch(dropdown, /backdrop-blur/);
  assert.doesNotMatch(dropdown, /cornerClass\(/);
  assert.doesNotMatch(dropdown, /elevationClass\(['"]overlay['"]\)/);
  assert.doesNotMatch(dropdown, /shadow-xl/);
  assert.doesNotMatch(dropdown, /rounded-xl|rounded-full/);
});
