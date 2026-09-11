import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyQueueDisplaySortParam,
  defaultDirForQueueSort,
  flipQueueDisplaySortDir,
  isQueueColumnSort,
  parseQueueDisplaySort,
  parseQueueDisplaySortDir,
  QUEUE_CARRIER_SORT_GROUP,
  QUEUE_CHANNEL_SORT_GROUP,
  QUEUE_DISPLAY_SORT_OPTIONS,
  queueCarrierSortOptions,
  queueChannelSortOptions,
  queueColumnSortOptions,
  queueDisplaySortFace,
} from '@/utils/queue-display-sort';

describe('queue-display-sort', () => {
  it('parses known sorts; defaults to deadline; maps retired priority', () => {
    assert.equal(parseQueueDisplaySort(null), 'deadline');
    assert.equal(parseQueueDisplaySort('priority'), 'deadline', 'Priority was ship-by');
    assert.equal(parseQueueDisplaySort('newest'), 'newest');
    assert.equal(parseQueueDisplaySort('deadline'), 'deadline');
    assert.equal(parseQueueDisplaySort('title'), 'title');
    assert.equal(parseQueueDisplaySort('tracking'), 'tracking');
    assert.equal(parseQueueDisplaySort('age'), 'age');
    assert.equal(parseQueueDisplaySort('picked'), 'picked');
    assert.equal(parseQueueDisplaySort('packed'), 'packed');
    assert.equal(parseQueueDisplaySort('carrier'), 'carrier');
    assert.equal(parseQueueDisplaySort('carrier:USPS'), 'carrier:USPS');
    assert.equal(parseQueueDisplaySort('carrier:UPS'), 'carrier:UPS');
    assert.equal(parseQueueDisplaySort('carrier:FedEx'), 'carrier:FedEx');
    assert.equal(parseQueueDisplaySort('carrier:Amazon'), 'channel:Amazon', 'Amazon Order-dot collision');
    assert.equal(parseQueueDisplaySort('channel:Amazon'), 'channel:Amazon');
    assert.equal(parseQueueDisplaySort('channel:eBay'), 'channel:eBay');
    assert.equal(parseQueueDisplaySort('carrier:Nope'), 'deadline', 'unknown pin is not a sort');
    assert.equal(parseQueueDisplaySort('carrier:'), 'deadline');
    assert.equal(parseQueueDisplaySort('sla'), 'age', 'retired fused Ship-by → Late');
    assert.equal(parseQueueDisplaySort('date'), 'age', 'retired civil-date column → Late');
    assert.equal(parseQueueDisplaySort('condition'), 'title', 'retired Cond column → Product sort');
    assert.equal(parseQueueDisplaySort('nope'), 'deadline');
  });

  it('parses dir only for column sorts', () => {
    assert.equal(parseQueueDisplaySortDir('asc', 'deadline'), null);
    assert.equal(parseQueueDisplaySortDir('desc', 'newest'), null);
    assert.equal(parseQueueDisplaySortDir('asc', 'title'), 'asc');
    assert.equal(parseQueueDisplaySortDir('desc', 'title'), 'desc');
    assert.equal(parseQueueDisplaySortDir(null, 'title'), 'asc');
    assert.equal(parseQueueDisplaySortDir(null, 'age'), 'desc');
    assert.equal(parseQueueDisplaySortDir('nope', 'qty'), 'asc');
  });

  it('omits ?sort= for deadline (and retired priority); sets otherwise; clears dir on composites', () => {
    const params = new URLSearchParams('sort=newest&dir=asc');
    applyQueueDisplaySortParam(params, 'deadline');
    assert.equal(params.has('sort'), false);
    assert.equal(params.has('dir'), false);
    applyQueueDisplaySortParam(params, 'newest');
    assert.equal(params.get('sort'), 'newest');
    assert.equal(params.has('dir'), false);
  });

  it('writes column sort; omits dir when default', () => {
    const params = new URLSearchParams();
    applyQueueDisplaySortParam(params, 'title', 'asc');
    assert.equal(params.get('sort'), 'title');
    assert.equal(params.has('dir'), false);

    applyQueueDisplaySortParam(params, 'title', 'desc');
    assert.equal(params.get('dir'), 'desc');

    applyQueueDisplaySortParam(params, 'age', 'asc');
    assert.equal(params.get('sort'), 'age');
    assert.equal(params.get('dir'), 'asc');

    applyQueueDisplaySortParam(params, 'age', 'desc');
    assert.equal(params.has('dir'), false);
  });

  it('identifies column sorts and default dirs', () => {
    assert.equal(isQueueColumnSort('title'), true);
    assert.equal(isQueueColumnSort('age'), true);
    assert.equal(isQueueColumnSort('picked'), true);
    assert.equal(isQueueColumnSort('packed'), true);
    assert.equal(isQueueColumnSort('carrier'), true);
    assert.equal(isQueueColumnSort('carrier:USPS'), true);
    assert.equal(isQueueColumnSort('channel:Amazon'), true);
    assert.equal(isQueueColumnSort('carrier:Nope'), false);
    assert.equal(defaultDirForQueueSort('carrier'), 'asc');
    assert.equal(defaultDirForQueueSort('carrier:USPS'), 'asc');
    assert.equal(isQueueColumnSort('sla'), false, 'sla is retired — parse alias only');
    assert.equal(isQueueColumnSort('priority'), false);
    assert.equal(defaultDirForQueueSort('age'), 'desc');
    assert.equal(defaultDirForQueueSort('qty'), 'asc');
    assert.equal(defaultDirForQueueSort('carrier'), 'asc');
    assert.equal(defaultDirForQueueSort('deadline'), null);
    assert.equal(flipQueueDisplaySortDir('asc'), 'desc');
  });

  it('writes a carrier pin as ?sort=carrier:USPS, no rank label', () => {
    const params = new URLSearchParams();
    applyQueueDisplaySortParam(params, 'carrier:USPS', 'asc');
    assert.equal(params.get('sort'), 'carrier:USPS');
    assert.equal(params.has('dir'), false);
  });

  it('rewrites a Carriers Amazon click to ?sort=channel:Amazon on write', () => {
    const params = new URLSearchParams();
    applyQueueDisplaySortParam(params, parseQueueDisplaySort('carrier:Amazon'), 'asc');
    assert.equal(params.get('sort'), 'channel:Amazon');
    assert.equal(params.has('dir'), false);
  });

  it('lists exact carrier names under Carriers — never "USPS first"', () => {
    for (const option of QUEUE_DISPLAY_SORT_OPTIONS) {
      assert.notEqual(option.label, 'USPS first');
      assert.notEqual(option.id, 'carrier');
    }
    const carriers = queueCarrierSortOptions();
    assert.ok(carriers.length >= 3);
    for (const option of carriers) {
      assert.equal(option.group, QUEUE_CARRIER_SORT_GROUP);
      assert.equal(option.label, option.shortLabel);
      assert.equal(option.id, `carrier:${option.label}`);
      assert.equal(option.identity.kind, 'carrier');
      assert.equal(option.identity.label, option.label);
      assert.doesNotMatch(option.label, /first/i);
    }
    const labels = carriers.map((o) => o.label);
    assert.ok(labels.includes('USPS'));
    assert.ok(labels.includes('UPS'));
    assert.ok(labels.includes('FedEx'));
    assert.equal(labels.includes('Unknown'), false);
    const sorted = [...labels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    assert.deepEqual(labels, sorted);
  });

  it('View menu is Newest + ship-by only — no Priority, no Column rows', () => {
    assert.deepEqual(
      QUEUE_DISPLAY_SORT_OPTIONS.map((o) => o.id),
      ['newest', 'deadline'],
    );
    for (const option of QUEUE_DISPLAY_SORT_OPTIONS) {
      assert.equal(option.group, 'View');
      assert.notEqual(option.id, 'priority');
      assert.notEqual(option.group, 'Column');
    }
  });

  it('lists Platform names — Amazon and eBay are Order-column faces', () => {
    assert.equal(QUEUE_CHANNEL_SORT_GROUP, 'Platform');
    const channels = queueChannelSortOptions();
    assert.ok(channels.length >= 2);
    for (const option of channels) {
      assert.equal(option.group, QUEUE_CHANNEL_SORT_GROUP);
      assert.equal(option.id, `channel:${option.label}`);
      assert.equal(option.identity.kind, 'platform');
      assert.equal(option.identity.label, option.label);
    }
    const amazon = channels.find((o) => o.label === 'Amazon');
    assert.ok(amazon);
    assert.equal(amazon.identity.kind, 'platform');
    const labels = channels.map((o) => o.label);
    assert.ok(labels.includes('Amazon'));
    assert.ok(labels.includes('eBay'));
    assert.equal(labels.filter((l) => l === 'Amazon').length, 1, 'Amazon + FBA share one face');
  });

  it('names the exact closed-control face, including header-click columns', () => {
    assert.equal(queueDisplaySortFace('newest').shortLabel, 'Newest');
    assert.equal(queueDisplaySortFace('deadline').shortLabel, 'Deadline');
    assert.equal(queueDisplaySortFace('title').shortLabel, 'Product');
    assert.equal(queueDisplaySortFace('age').shortLabel, 'Days late');
    assert.equal(queueDisplaySortFace('order').shortLabel, 'Order');
    const amazon = queueDisplaySortFace('channel:Amazon');
    assert.equal(amazon.shortLabel, 'Amazon');
    assert.equal(amazon.identity?.kind, 'platform');
    const usps = queueDisplaySortFace('carrier:USPS');
    assert.equal(usps.shortLabel, 'USPS');
    assert.equal(usps.identity?.kind, 'carrier');
    assert.equal(queueDisplaySortFace('packed').shortLabel, 'Pack');
    assert.equal(queueDisplaySortFace('picked').shortLabel, 'Pick');
  });

  it('lists Pack / Status / Amount as toolbar column-sort facts', () => {
    const ids = queueColumnSortOptions().map((o) => o.id);
    for (const fact of ['status', 'amount', 'packed', 'picked', 'age'] as const) {
      assert.ok(ids.includes(fact), `toolbar sort menu lists ${fact}`);
    }
  });
});
