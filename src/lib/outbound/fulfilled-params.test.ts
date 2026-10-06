import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRouteParams } from '@/lib/routing/route-params';
import { routeParamsFor } from '@/lib/routing/registry';
import { SHIPPING_SHIPPED_PATH } from '@/lib/shipping/shipped-desk';
import {
  FULFILLED_LAYOUT_PARAM,
  FULFILLED_ONLY_PARAMS,
  fulfilledApiParams,
  readFulfilledBoardDisplay,
  readFulfilledLayout,
} from './fulfilled-params';

test('the board is the default layout; only `sheet` opens the sheet', () => {
  assert.equal(readFulfilledLayout(new URLSearchParams()), 'board');
  assert.equal(readFulfilledLayout(new URLSearchParams('layout=board')), 'board');
  assert.equal(readFulfilledLayout(new URLSearchParams('layout=Sheet')), 'sheet');
  assert.equal(readFulfilledLayout(new URLSearchParams('layout=all')), 'board');
});

test('the board always asks for order grain; the sheet sends its grain', () => {
  const board = fulfilledApiParams(new URLSearchParams('grain=line&carrier=UPS'), '');
  assert.equal(board.get('grain'), null);
  assert.equal(board.get('carrier'), 'UPS');
  const sheet = fulfilledApiParams(new URLSearchParams('layout=sheet&grain=line'), 'ABC');
  assert.equal(sheet.get('grain'), 'line');
  assert.equal(sheet.get('q'), 'ABC');
  // The layout itself never reaches the API.
  assert.equal(sheet.get(FULFILLED_LAYOUT_PARAM), null);
});

test('saved views keep the layout', () => {
  assert.ok((FULFILLED_ONLY_PARAMS as readonly string[]).includes(FULFILLED_LAYOUT_PARAM));
});

test('/fulfilled keeps `layout=sheet` (owned here, not the station tables\' ambient board/all) and drops anything else', () => {
  const spec = routeParamsFor(SHIPPING_SHIPPED_PATH);
  assert.ok(spec, 'Fulfilled has a route spec');
  const parse = (qs: string) => parseRouteParams(spec, new URLSearchParams(qs)).toString();
  assert.equal(parse('layout=sheet&status=late'), 'layout=sheet&status=late');
  assert.equal(parse('layout=board'), 'layout=board');
  assert.equal(parse('layout=all'), '');
});

test('Packed by me sends the viewer as packer; a named packer wins; the display toggles never reach the API', () => {
  const mine = fulfilledApiParams(new URLSearchParams('mine=me&done=hide&untracked=hide&cards=compact&group=carrier'), '', 42);
  assert.equal(mine.toString(), 'packer=42');
  assert.equal(fulfilledApiParams(new URLSearchParams('mine=me&packer=7'), '', 42).get('packer'), '7');
  assert.equal(fulfilledApiParams(new URLSearchParams('mine=me'), '', null).get('packer'), null);
});

test('the board display toggles read from the URL; unset = every column, full cards, no grouping', () => {
  assert.deepEqual(readFulfilledBoardDisplay(new URLSearchParams()), { hideDone: false, hideUntracked: false, compact: false, groupByCarrier: false });
  assert.deepEqual(readFulfilledBoardDisplay(new URLSearchParams('done=hide&untracked=hide&cards=compact&group=carrier')), {
    hideDone: true,
    hideUntracked: true,
    compact: true,
    groupByCarrier: true,
  });
  const spec = routeParamsFor(SHIPPING_SHIPPED_PATH)!;
  const kept = parseRouteParams(spec, new URLSearchParams('mine=me&done=hide&untracked=hide&cards=compact&group=carrier'));
  assert.deepEqual([...kept.entries()].sort(), [['cards', 'compact'], ['done', 'hide'], ['group', 'carrier'], ['mine', 'me'], ['untracked', 'hide']]);
});
