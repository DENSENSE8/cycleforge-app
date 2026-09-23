import assert from 'node:assert/strict';
import test from 'node:test';
import { createThinkStripper } from './think-stripper';

test('flush preserves the final visible characters of a completed stream', () => {
  const stripper = createThinkStripper();
  const visible = stripper.push('| model | connected |') + stripper.flush();
  assert.equal(visible, '| model | connected |');
});

test('reasoning tags split across chunks remain hidden', () => {
  const stripper = createThinkStripper();
  const visible = [
    stripper.push('Answer<th'),
    stripper.push('ink>private reasoning</thi'),
    stripper.push('nk> shown'),
    stripper.flush(),
  ].join('');
  assert.equal(visible, 'Answer shown');
});

test('an unfinished reasoning block is never exposed by flush', () => {
  const stripper = createThinkStripper();
  const visible = stripper.push('Answer<think>private') + stripper.flush();
  assert.equal(visible, 'Answer');
});
