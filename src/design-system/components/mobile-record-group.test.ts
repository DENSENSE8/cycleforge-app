import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MOBILE_RECORD_GROUP_CLASS,
  MOBILE_RECORD_GROUP_TITLE_CLASS,
  MOBILE_RECORD_ROW_CLASS,
} from './MobileRecordGroup';

test('mobile record groups share the desktop title voice without all-caps or a boxed metric surface', () => {
  assert.doesNotMatch(MOBILE_RECORD_GROUP_TITLE_CLASS, /uppercase|font-mono|tracking-wide/);
  assert.doesNotMatch(MOBILE_RECORD_GROUP_CLASS, /sunken|well|rounded|shadow/);
  assert.match(MOBILE_RECORD_GROUP_CLASS, /(?:^|\s)bg-surface-card(?:\s|$)/);
  assert.match(MOBILE_RECORD_ROW_CLASS, /(?:^|\s)min-h-mode-hit(?:\s|$)/);
});
