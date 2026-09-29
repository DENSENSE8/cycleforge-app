import test from 'node:test';
import assert from 'node:assert/strict';
import { recordCardOutlineClass } from './record-card-outline';

test('open record outline is a contained border rather than overflow-prone ring paint', () => {
  const className = recordCardOutlineClass({ selected: false, open: true });
  assert.match(className, /\bbox-border\b/);
  assert.match(className, /\bborder-border-strong\b/);
  assert.doesNotMatch(className, /\bring(?:-|\b)/);
});

test('checked record outline stays inside the same two-pixel border box', () => {
  const className = recordCardOutlineClass({ selected: true, open: false });
  assert.match(className, /\bborder-2\b/);
  assert.match(className, /\bborder-fill-info\b/);
  assert.doesNotMatch(className, /\bring(?:-|\b)/);
});
