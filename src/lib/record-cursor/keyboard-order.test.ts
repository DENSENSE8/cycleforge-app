import test from 'node:test';
import assert from 'node:assert/strict';
import { recordCursorKeyDirection } from './keyboard-order';

test('stock key order maps J to previous and K to next without inverting arrows', () => {
  assert.equal(recordCursorKeyDirection('KeyJ', 'j-prev'), 'prev');
  assert.equal(recordCursorKeyDirection('KeyK', 'j-prev'), 'next');
  assert.equal(recordCursorKeyDirection('ArrowUp', 'j-prev'), 'prev');
  assert.equal(recordCursorKeyDirection('ArrowDown', 'j-prev'), 'next');
});

test('default cursor surfaces retain Vim J-next and K-previous', () => {
  assert.equal(recordCursorKeyDirection('KeyJ', undefined), 'next');
  assert.equal(recordCursorKeyDirection('KeyK', undefined), 'prev');
  assert.equal(recordCursorKeyDirection('Enter', undefined), null);
});
