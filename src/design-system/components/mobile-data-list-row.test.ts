import assert from 'node:assert/strict';
import test from 'node:test';
import { MOBILE_DATA_LIST_ROW_INTERACTION_CLASS } from './MobileDataListRow';

test('V2 data rows use quiet feedback and never invert to the black ink face', () => {
  assert.match(MOBILE_DATA_LIST_ROW_INTERACTION_CLASS, /(?:^|\s)hover:bg-surface-hover(?:\s|$)/);
  assert.match(MOBILE_DATA_LIST_ROW_INTERACTION_CLASS, /(?:^|\s)active:bg-surface-selected(?:\s|$)/);
  assert.doesNotMatch(MOBILE_DATA_LIST_ROW_INTERACTION_CLASS, /mode-ink|bg-black|text-mode-panel/);
});
