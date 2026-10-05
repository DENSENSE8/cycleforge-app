import test from 'node:test';
import assert from 'node:assert/strict';

import {
  auditRingStateSource,
  compareRingStateBaseline,
  formatRingStateHit,
  RING_STATE_FIX,
} from './ring-state-law';

const FILE = 'src/components/example/Card.tsx';
const classesOf = (source: string) => auditRingStateSource(FILE, source).map((h) => h.classes);

/* ── state booleans ────────────────────────────────────────────────────── */

test('a ring class string chosen by a state boolean is a hit', () => {
  assert.deepEqual(classesOf(`cn('rounded-xl', selected && 'ring-2 ring-blue-500')`), [['ring-2', 'ring-blue-500']]);
  assert.deepEqual(classesOf(`cn('p-3', body.isOpen && 'ring-1 ring-inset ring-border-strong')`), [
    ['ring-1', 'ring-inset', 'ring-border-strong'],
  ]);
});

test('a ternary hits on either branch, through a member chain or template interpolation', () => {
  assert.deepEqual(classesOf(`cn(row.isSelected ? 'bg-surface-card ring-1' : 'bg-transparent')`), [['ring-1']]);
  assert.deepEqual(classesOf(`cn(row?.active ? 'bg-surface-card' : 'ring-border-soft')`), [['ring-border-soft']]);
  assert.deepEqual(classesOf('className={`card ${isCurrent ? "ring-offset-2" : ""}`}'), [['ring-offset-2']]);
});

test('optional types, nullish coalescing and longer identifiers are not state guards', () => {
  assert.deepEqual(classesOf(`type P = { selected?: 'ring' | 'fill' };`), []);
  assert.deepEqual(classesOf(`const c = selected ?? 'ring-2';`), []);
  assert.deepEqual(classesOf(`const c = preselected && 'ring-2';`), []);
});

/* ── state variants ────────────────────────────────────────────────────── */

test('a ring under a state variant is a hit', () => {
  assert.deepEqual(classesOf(`'aria-selected:ring-2 aria-selected:ring-fill-info'`), [
    ['aria-selected:ring-2', 'aria-selected:ring-fill-info'],
  ]);
  assert.deepEqual(classesOf(`'data-[state=open]:ring-1'`), [['data-[state=open]:ring-1']]);
  assert.deepEqual(classesOf(`'data-[active=true]:ring-inset'`), [['data-[active=true]:ring-inset']]);
  assert.deepEqual(classesOf(`'group-aria-selected/card:!ring-2'`), [['group-aria-selected/card:!ring-2']]);
  assert.deepEqual(classesOf(`'dark:aria-current:ring'`), [['dark:aria-current:ring']]);
});

/* ── not hits ──────────────────────────────────────────────────────────── */

test('focus and hover rings are focus recipes, not state outlines', () => {
  assert.deepEqual(classesOf(`'focus-visible:ring-2 focus-visible:ring-inset focus:ring-1 focus-within:ring-1 hover:ring-1'`), []);
  assert.deepEqual(classesOf(`cn(selected && 'focus-visible:ring-2 hover:ring-border-soft')`), []);
  assert.deepEqual(classesOf(`'aria-selected:focus-visible:ring-2 group-hover/card:ring-1'`), []);
});

test('static rings, ring-0, non-ring words and comments are not hits', () => {
  assert.deepEqual(classesOf(`'rounded-xl ring-1 ring-inset ring-border-hairline'`), []);
  assert.deepEqual(classesOf(`cn(selected && 'ring-0', open ? 'ring-offset-0' : '')`), []);
  assert.deepEqual(classesOf(`const s: string = focusRing('field', 'accent');`), []);
  assert.deepEqual(classesOf(`// selected && 'ring-2'\n/* aria-selected:ring-2 */\n{/* open ? 'ring-1' : '' */}`), []);
  assert.deepEqual(classesOf(`const url = 'https://x.test'; const c = selected && 'ring-2';`), [['ring-2']]);
});

/* ── escape ────────────────────────────────────────────────────────────── */

test('ds-allow-ring with a reason, same line or the line above, suppresses the hit', () => {
  assert.deepEqual(classesOf(`selected && 'ring-2', // ds-allow-ring: avatar sits outside any scroller`), []);
  assert.deepEqual(classesOf(`{/* ds-allow-ring: static grid, never scrolls */}\n'aria-selected:ring-2'`), []);
  assert.deepEqual(classesOf(`// ds-allow-ring: one line only\nconst a = 1;\nselected && 'ring-2'`), [['ring-2']]);
});

test('a bare ds-allow-ring tag without a reason does not escape', () => {
  assert.deepEqual(classesOf(`selected && 'ring-2', // ds-allow-ring:`), [['ring-2']]);
  assert.deepEqual(classesOf(`{/* ds-allow-ring: */}\n'aria-selected:ring-2'`), [['aria-selected:ring-2']]);
});

test('the law module and its test are exempt; non-source files are out of scope', () => {
  assert.deepEqual(auditRingStateSource('src/lib/design/ring-state-law.test.ts', `selected && 'ring-2'`), []);
  assert.deepEqual(auditRingStateSource('scripts/x.ts', `selected && 'ring-2'`), []);
});

/* ── failure face ──────────────────────────────────────────────────────── */

test('a hit names file:line, the offending class and the geometry fix', () => {
  const [hit] = auditRingStateSource(FILE, `const a = 1;\ncn(selected && 'ring-2')`);
  const line = formatRingStateHit(hit);
  assert.match(line, /^src\/components\/example\/Card\.tsx:2 — `ring-2` — /);
  assert.ok(line.endsWith(RING_STATE_FIX));
  assert.match(RING_STATE_FIX, /STATE_OUTLINE_CLASS/);
  assert.match(RING_STATE_FIX, /ds-allow-ring: <reason>/);
});

/* ── baseline ratchet ──────────────────────────────────────────────────── */

test('the baseline ratchet: new file and increase fail, equal passes, a drop asks to shrink', () => {
  const two = auditRingStateSource(FILE, `selected && 'ring-2'\n'aria-current:ring-1'`);
  assert.equal(two.length, 2);

  const fresh = compareRingStateBaseline(two, { files: {} });
  assert.deepEqual(
    fresh.map((f) => [f.severity, f.file, f.hits.length]),
    [['error', FILE, 2]],
  );

  assert.deepEqual(compareRingStateBaseline(two, { files: { [FILE]: 2 } }), []);

  const grew = compareRingStateBaseline(two, { files: { [FILE]: 1 } });
  assert.deepEqual(grew.map((f) => f.severity), ['error']);
  assert.match(grew[0].message, /baseline 1/);

  const shrank = compareRingStateBaseline(two.slice(0, 1), { files: { [FILE]: 2 } });
  assert.deepEqual(shrank.map((f) => f.severity), ['advisory']);
  assert.match(shrank[0].message, /shrink the baseline/);

  const gone = compareRingStateBaseline([], { files: { [FILE]: 2 } });
  assert.deepEqual(gone.map((f) => [f.severity, f.file]), [['advisory', FILE]]);
});
