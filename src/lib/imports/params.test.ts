import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPORT_MAX_PAGE_SIZE, parseImportParams, resolveImportWindow } from './params';

const TODAY = '2026-09-28';
const parse = (view: 'runs' | 'rows' | null, qs: string) => parseImportParams(view, new URLSearchParams(qs), TODAY);

test('no dates = the last 7 PT days, today included, as exact instants', () => {
  const { window } = parse('runs', '');
  assert.deepEqual(window, {
    dateFrom: '2026-09-22',
    dateTo: '2026-09-28',
    // PDT (UTC-7): midnight Sep 22 → midnight Sep 29.
    fromIso: '2026-09-22T07:00:00.000Z',
    toIso: '2026-09-29T07:00:00.000Z',
    explicit: false,
  });
});

test('explicit dates with times narrow the ends; timeTo keeps its whole minute', () => {
  const { window } = parse('rows', 'dateFrom=2026-09-20&dateTo=2026-09-21&timeFrom=09:00&timeTo=11:30');
  assert.equal(window?.fromIso, '2026-09-20T16:00:00.000Z');
  assert.equal(window?.toIso, '2026-09-21T18:31:00.000Z');
  assert.equal(window?.explicit, true);
});

test('one date alone is that day; reversed dates are swapped; times without dates are ignored', () => {
  assert.deepEqual(
    [parse('runs', 'dateTo=2026-09-10').window?.dateFrom, parse('runs', 'dateTo=2026-09-10').window?.dateTo],
    ['2026-09-10', '2026-09-10'],
  );
  const swapped = parse('runs', 'dateFrom=2026-09-12&dateTo=2026-09-10').window;
  assert.deepEqual([swapped?.dateFrom, swapped?.dateTo], ['2026-09-10', '2026-09-12']);
  assert.deepEqual(parse('runs', 'timeFrom=09:00').window, parse('runs', '').window);
});

test('a pinned run (rows) or cron run (runs) drops the default window, never an explicit one', () => {
  assert.equal(parse('rows', 'run=12').window, null);
  assert.equal(parse('runs', 'cronRun=7').window, null);
  assert.equal(parse('rows', 'run=12&dateFrom=2026-09-01').window?.dateFrom, '2026-09-01');
  // `run` does not pin the runs list (it only opens a record there).
  assert.equal(parse('runs', 'run=12').runId, null);
  assert.notEqual(parse('runs', 'run=12').window, null);
});

test('params that the view shows no control for never narrow it', () => {
  const rows = parse('rows', 'status=failed&staff=4&cronRun=3&outcome=inserted');
  assert.equal(rows.status, null);
  assert.equal(rows.staffId, null);
  assert.equal(rows.cronRunId, null);
  assert.deepEqual(rows.outcomes, ['inserted']);
  const runs = parse('runs', 'status=failed&staff=4&platform=ebay&account=Main&outcome=inserted');
  assert.equal(runs.status, 'failed');
  assert.equal(runs.staffId, 4);
  assert.deepEqual([runs.platforms, runs.accounts, runs.outcomes], [[], [], []]);
});

test('multi-value facets read comma-joined and repeated keys, de-duplicated; unknown outcomes drop', () => {
  const f = parse('rows', 'source=google_sheets,shipstation&source=square,shipstation&outcome=inserted,bogus,failed');
  assert.deepEqual(f.sources, ['google_sheets', 'shipstation', 'square']);
  assert.deepEqual(f.outcomes, ['inserted', 'failed']);
});

test('invalid values fall back to the defaults instead of failing', () => {
  const f = parse(null, 'view=nope&trigger=weekly&status=done&page=0&pageSize=-3&sort=inserted&dateFrom=09/01/2026');
  assert.equal(f.view, 'runs');
  assert.equal(f.trigger, null);
  assert.equal(f.status, null);
  assert.equal(f.page, 1);
  assert.equal(f.pageSize, 50);
  assert.equal(f.sort, 'inserted');
  assert.equal(f.window?.explicit, false);
});

test('sort is per view; page size is bounded', () => {
  assert.equal(parse('rows', 'sort=inserted').sort, 'newest');
  assert.equal(parse('rows', 'sort=order').sort, 'order');
  assert.equal(parse('runs', 'sort=order').sort, 'newest');
  assert.equal(parse('runs', 'pageSize=5000').pageSize, IMPORT_MAX_PAGE_SIZE);
  assert.equal(parse(null, 'view=rows').view, 'rows');
});

test('resolveImportWindow crosses the DST change on the PT clock', () => {
  // 2026-11-01 is the fall-back day: midnight is PDT, the next midnight PST.
  const w = resolveImportWindow({ dateFrom: '2026-11-01', dateTo: '2026-11-01', pinned: false }, TODAY);
  assert.equal(w?.fromIso, '2026-11-01T07:00:00.000Z');
  assert.equal(w?.toIso, '2026-11-02T08:00:00.000Z');
});
