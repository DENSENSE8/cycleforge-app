import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gridHeaderAriaSort } from './GridHeaderLabel';

describe('GridHeaderLabel — title, then arrow, black ink', () => {
  it('aria-sort is none when sortable and inactive, absent when not sortable', () => {
    assert.equal(gridHeaderAriaSort(false, null, true), 'none');
    assert.equal(gridHeaderAriaSort(false, null, false), undefined);
    assert.equal(gridHeaderAriaSort(true, 'asc', true), 'ascending');
    assert.equal(gridHeaderAriaSort(true, 'desc', true), 'descending');
  });
});
