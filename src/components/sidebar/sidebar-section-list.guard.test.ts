/**
 * Guard: SidebarSectionList ops density renders optional trailing counts.
 * Incoming facet rail (and future Media day rows) compose this — never fork
 * a hand-rolled count span beside the list.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'SidebarSectionList.tsx'), 'utf8');

test('SidebarSection declares optional count + trailing', () => {
  assert.match(src, /count\?: number/);
  assert.match(src, /trailing\?: ReactNode/);
});

test('ops rows render tabular trailing count', () => {
  assert.match(src, /typeof s\.count === 'number'/);
  assert.match(src, /tabular-nums/);
  assert.match(src, /text-role-micro/);
});

test('iconClassName can override default icon tone', () => {
  assert.match(src, /iconClassName\?:/);
  assert.match(src, /s\.iconClassName \?\?/);
});
