import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyQueueDisplaySortParam,
  defaultDirForQueueSort,
  flipQueueDisplaySortDir,
  isQueueColumnSort,
  parseQueueDisplaySort,
  parseQueueDisplaySortDir,
} from '@/utils/queue-display-sort';

describe('queue-display-sort', () => {
  it('parses known sorts; defaults to priority', () => {
    assert.equal(parseQueueDisplaySort(null), 'priority');
    assert.equal(parseQueueDisplaySort('newest'), 'newest');
    assert.equal(parseQueueDisplaySort('deadline'), 'deadline');
    assert.equal(parseQueueDisplaySort('title'), 'title');
    assert.equal(parseQueueDisplaySort('tracking'), 'tracking');
    assert.equal(parseQueueDisplaySort('nope'), 'priority');
  });

  it('parses dir only for column sorts', () => {
    assert.equal(parseQueueDisplaySortDir('asc', 'priority'), null);
    assert.equal(parseQueueDisplaySortDir('desc', 'newest'), null);
    assert.equal(parseQueueDisplaySortDir('asc', 'title'), 'asc');
    assert.equal(parseQueueDisplaySortDir('desc', 'title'), 'desc');
    assert.equal(parseQueueDisplaySortDir(null, 'title'), 'asc');
    assert.equal(parseQueueDisplaySortDir(null, 'sla'), 'asc');
    assert.equal(parseQueueDisplaySortDir('nope', 'qty'), 'asc');
  });

  it('omits ?sort= for priority; sets otherwise; clears dir on composites', () => {
    const params = new URLSearchParams('sort=newest&dir=asc');
    applyQueueDisplaySortParam(params, 'priority');
    assert.equal(params.has('sort'), false);
    assert.equal(params.has('dir'), false);
    applyQueueDisplaySortParam(params, 'deadline');
    assert.equal(params.get('sort'), 'deadline');
    assert.equal(params.has('dir'), false);
  });

  it('writes column sort; omits dir when default', () => {
    const params = new URLSearchParams();
    applyQueueDisplaySortParam(params, 'title', 'asc');
    assert.equal(params.get('sort'), 'title');
    assert.equal(params.has('dir'), false);

    applyQueueDisplaySortParam(params, 'title', 'desc');
    assert.equal(params.get('dir'), 'desc');

    applyQueueDisplaySortParam(params, 'sla', 'desc');
    assert.equal(params.get('sort'), 'sla');
    assert.equal(params.get('dir'), 'desc');

    applyQueueDisplaySortParam(params, 'sla', 'asc');
    assert.equal(params.has('dir'), false);
  });

  it('identifies column sorts and default dirs', () => {
    assert.equal(isQueueColumnSort('title'), true);
    assert.equal(isQueueColumnSort('priority'), false);
    assert.equal(defaultDirForQueueSort('sla'), 'asc');
    assert.equal(defaultDirForQueueSort('qty'), 'asc');
    assert.equal(defaultDirForQueueSort('priority'), null);
    assert.equal(flipQueueDisplaySortDir('asc'), 'desc');
  });
});
