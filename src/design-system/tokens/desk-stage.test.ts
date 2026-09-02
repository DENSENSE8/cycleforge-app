import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DESK_TAB_LIST_CLASS,
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
