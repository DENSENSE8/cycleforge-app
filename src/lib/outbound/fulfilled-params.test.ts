import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRouteParams } from '@/lib/routing/route-params';
import { routeParamsFor } from '@/lib/routing/registry';
import { SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';
import { FULFILLED_LAYOUT_PARAM, fulfilledApiParams, readFulfilledBoardDisplay, readFulfilledLayout } from './fulfilled-params';
import { fulfilledLegacySearch, readFulfilledColumn } from './fulfilled-url';

test('the board is the default layout; only `sheet` opens the sheet', () => {
  assert.equal(readFulfilledLayout(new URLSearchParams()), 'board');
  assert.equal(readFulfilledLayout(new URLSearchParams('layout=board')), 'board');
  assert.equal(readFulfilledLayout(new URLSearchParams('layout=Sheet')), 'sheet');
  assert.equal(readFulfilledLayout(new URLSearchParams('layout=all')), 'board');
});

test('one answer feeds the board and the sheet: grain, layout and bucket never reach the API; Records params pass through', () => {
  const api = fulfilledApiParams(new URLSearchParams('grain=line&layout=sheet&col=late&platform=ebay&carrier=UPS&colsort=journey&coldir=asc'), 'ABC');
  assert.equal(api.get('grain'), null);
  assert.equal(api.get(FULFILLED_LAYOUT_PARAM), null);
  assert.equal(api.get('col'), null);
  assert.equal(api.get('platform'), 'ebay');
  assert.equal(api.get('carrier'), 'UPS');
  // The order travels as the API's own `sort` / `dir`.
  assert.equal(api.get('sort'), 'journey');
  assert.equal(api.get('dir'), 'asc');
  assert.equal(api.get('q'), 'ABC');
  // A bucket with no sort named reads worst first; the whole window keeps the read's default.
  assert.equal(fulfilledApiParams(new URLSearchParams('col=late'), '').get('sort'), 'overdue');
  assert.equal(fulfilledApiParams(new URLSearchParams('layout=sheet'), '').get('sort'), null);
});

test('Packed by me sends the viewer as packer; a named packer wins; the display toggles never reach the API', () => {
  const mine = fulfilledApiParams(new URLSearchParams('mine=me&done=hide&group=carrier'), '', 42);
  assert.equal(mine.toString(), 'packer=42');
  assert.equal(fulfilledApiParams(new URLSearchParams('mine=me&packer=7'), '', 42).get('packer'), '7');
  assert.equal(fulfilledApiParams(new URLSearchParams('mine=me'), '', null).get('packer'), null);
});

test('the bucket (`col`) is any journey bucket — a board column, a view, a check-in stage; junk is none', () => {
  assert.equal(readFulfilledColumn(new URLSearchParams('col=stalled')), 'stalled');
  assert.equal(readFulfilledColumn(new URLSearchParams('col=happy')), 'happy');
  assert.equal(readFulfilledColumn(new URLSearchParams('col=nope')), null);
  const spec = routeParamsFor(SHIPPING_SHIPPED_PATH)!;
  assert.equal(parseRouteParams(spec, new URLSearchParams('col=happy')).toString(), 'col=happy');
  assert.equal(parseRouteParams(spec, new URLSearchParams('col=nope')).toString(), '');
});

test('/fulfilled keeps the Records grain and `layout=sheet`, and drops the retired words', () => {
  const spec = routeParamsFor(SHIPPING_SHIPPED_PATH)!;
  const parse = (qs: string) => parseRouteParams(spec, new URLSearchParams(qs)).toString();
  assert.equal(parse('layout=sheet&grain=item'), 'grain=item&layout=sheet');
  assert.equal(parse('layout=all'), '');
  assert.equal(parse('axis=ship_by'), 'axis=ship_by');
  assert.equal(parse('axis=shipBy'), '');
});

test('a link written before the Records params lands on the same view, once', () => {
  assert.equal(fulfilledLegacySearch(new URLSearchParams('layout=sheet&grain=line')), null);
  const rewritten = new URLSearchParams(fulfilledLegacySearch(new URLSearchParams('channel=Amazon&axis=shipBy&colsort=customer&status=happy'))!);
  assert.equal(rewritten.get('channel'), null);
  assert.equal(rewritten.get('platform'), 'amazon');
  assert.equal(rewritten.get('axis'), 'ship_by');
  assert.equal(rewritten.get('colsort'), 'party');
  // The sheet's status chip is the bucket on the sheet now.
  assert.equal(rewritten.get('status'), null);
  assert.equal(rewritten.get('col'), 'happy');
  assert.equal(rewritten.get('layout'), 'sheet');
  // An explicit platform wins over the old channel; a junk status just drops.
  const kept = new URLSearchParams(fulfilledLegacySearch(new URLSearchParams('channel=ebay&platform=amazon&status=nope'))!);
  assert.equal(kept.get('platform'), 'amazon');
  assert.equal(kept.get('col'), null);
  // Rewriting is one way: the rewritten link needs nothing more.
  assert.equal(fulfilledLegacySearch(rewritten), null);
});

test('the board display toggles read from the URL; unset = every column, no grouping', () => {
  assert.deepEqual(readFulfilledBoardDisplay(new URLSearchParams()), { hideDone: false, groupByCarrier: false });
  assert.deepEqual(readFulfilledBoardDisplay(new URLSearchParams('done=hide&group=carrier')), { hideDone: true, groupByCarrier: true });
});
