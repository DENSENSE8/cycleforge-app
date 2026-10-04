import assert from 'node:assert/strict';
import test from 'node:test';
import { NAV_PAGE_DECLS } from '@/lib/nav/context/pages';
import { TRIAGE_VIEWS } from './index';
import { allTriageViews, checkCardViews } from './card-view-adapters';
import { cardViewMismatches } from './card-view-contract';

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

test("every view's card paints exactly the slots its view declares (status, channel, person, quick look, photo)", () => {
  const reports = checkCardViews();
  assert.equal(reports.length, allTriageViews().length);
  for (const report of reports) {
    assert.deepEqual(report.mismatches, [], `${report.id} (${report.adapter ?? 'no adapter'}) disagrees with its view`);
  }
});

test('the contract catches a card that drifts from its view', () => {
  const stock = allTriageViews().find((view) => view.id === 'inventory.stock')!;
  const painted = { status: 'date', channel: false, person: false, quickLook: true, photo: true } as const;
  assert.deepEqual(cardViewMismatches(stock, painted), []);
  assert.deepEqual(cardViewMismatches(stock, { ...painted, quickLook: false }), [
    "quick look: the view declares 'peek', the card folds none",
  ]);
  assert.deepEqual(cardViewMismatches(stock, { ...painted, status: 'state' }), [
    "status: the view declares 'date', the card paints 'state'",
  ]);
  assert.deepEqual(cardViewMismatches(stock, { ...painted, channel: true }), [
    "channel: the view declares 'none', the card paints one",
  ]);
  // A `line` view may carry a record without a photo; a `none` view handed one would silently drop it.
  assert.deepEqual(cardViewMismatches(stock, { ...painted, photo: false }), []);
  const racks = allTriageViews().find((view) => view.id === 'locations.racks')!;
  assert.deepEqual(cardViewMismatches(racks, { status: 'date', channel: false, person: false, quickLook: false, photo: true }), [
    "photo: the view declares 'none', the card is handed a line photo",
  ]);
});
