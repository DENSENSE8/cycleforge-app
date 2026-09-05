import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DESK_CHROME_STAGE_BODY_CLASS,
  DESK_STAGE_DETACH_CLASS,
  DESK_TAB_LIST_CLASS,
  DESK_TAB_ROW_CLASS,
  DESK_TAB_TRIGGER_CLASS,
} from './desk-stage';

test('desk tab primitive keeps fixed-width triggers and centers labels', () => {
  assert.match(DESK_TAB_LIST_CLASS, /\bflex\b/);
  assert.match(DESK_TAB_LIST_CLASS, /\bflex-1\b/);
  assert.match(DESK_TAB_TRIGGER_CLASS, /\bshrink-0\b/);
  assert.match(DESK_TAB_TRIGGER_CLASS, /\bjustify-center\b/);
  assert.match(DESK_TAB_TRIGGER_CLASS, /\btext-center\b/);
  assert.doesNotMatch(DESK_TAB_TRIGGER_CLASS, /\bflex-1\b|first:pl-0/);
});

test('desk table card welds to the tab row without a full-width hairline', () => {
  assert.equal(DESK_STAGE_DETACH_CLASS, '');
  assert.equal(DESK_TAB_ROW_CLASS, 'h-9');
  assert.doesNotMatch(DESK_TAB_ROW_CLASS, /\bborder-b\b/);
  assert.match(DESK_CHROME_STAGE_BODY_CLASS, /\brounded-b-xl\b/);
  assert.doesNotMatch(DESK_CHROME_STAGE_BODY_CLASS, /(?:^|\s)rounded-xl(?:\s|$)/);
});
