import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyQueueDisplaySortParam,
  parseQueueDisplaySort,
} from '@/utils/queue-display-sort';

describe('queue-display-sort', () => {
  it('parses known sorts; defaults to priority', () => {
    assert.equal(parseQueueDisplaySort(null), 'priority');
    assert.equal(parseQueueDisplaySort('newest'), 'newest');
    assert.equal(parseQueueDisplaySort('deadline'), 'deadline');
    assert.equal(parseQueueDisplaySort('nope'), 'priority');
  });

  it('omits ?sort= for priority; sets otherwise', () => {
    const params = new URLSearchParams('sort=newest');
    applyQueueDisplaySortParam(params, 'priority');
    assert.equal(params.has('sort'), false);
    applyQueueDisplaySortParam(params, 'deadline');
    assert.equal(params.get('sort'), 'deadline');
  });
});
