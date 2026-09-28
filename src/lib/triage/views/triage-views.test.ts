import assert from 'node:assert/strict';
import test from 'node:test';
import { NAV_PAGE_DECLS } from '@/lib/nav/context/pages';
import { TRIAGE_VIEWS } from './index';

const views = Object.values(TRIAGE_VIEWS);

/** The nav's declaration for a triage view id (`page.item`). */
function navView(id: string) {
  const [page, item] = id.split('.') as [string, string];
  return NAV_PAGE_DECLS[page]?.items?.[item];
}

test('every triage view is a view the nav declares', () => {
  for (const view of views) assert.ok(navView(view.id), `${view.id} is not a NAV_PAGE_DECLS item`);
});

test("a view's chip cut survives its saved views; the open record never does", () => {
  for (const view of views) {
    const saved = navView(view.id)?.savedViews;
    if (!saved) continue;
    assert.ok(saved.paramKeys.includes(view.chips.param), `${view.id}: saved views drop the chip param "${view.chips.param}"`);
    for (const param of view.recordParams) {
      assert.ok(!saved.paramKeys.includes(param), `${view.id}: saved views would pin the open record ("${param}")`);
    }
  }
});

test('views never share test ids or remembered prefs', () => {
  for (const key of ['testIdPrefix', 'bodyTestId'] as const) {
    const seen = views.map((view) => view[key]);
    assert.equal(new Set(seen).size, seen.length, `duplicate ${key}`);
  }
  const storage = views.flatMap((view) => [view.storageKeys.pageMode, view.storageKeys.scrollTop]);
  assert.equal(new Set(storage).size, storage.length, 'duplicate storage key');
});
