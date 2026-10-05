import test from 'node:test';
import assert from 'node:assert/strict';
import { closeSupportNextStep, isSupportNextStepOwed, openSupportNextStep } from './next-step-store';
import { supportReplyAnswers } from './support-record-model';

test('only sent and logged replies answer the customer (and owe the next step); a copy waits for Mark sent', () => {
  assert.equal(supportReplyAnswers('sent'), true);
  assert.equal(supportReplyAnswers('logged'), true);
  assert.equal(supportReplyAnswers('copied'), false);
  assert.equal(supportReplyAnswers('pending'), false);
  assert.equal(supportReplyAnswers('failed'), false);
  assert.equal(supportReplyAnswers(null), false);
});

test('the owed next step is keyed by item and survives until the step (or resolve) settles it', () => {
  assert.equal(isSupportNextStepOwed(595), false);
  openSupportNextStep(595);
  openSupportNextStep(595); // idempotent: a second answer in the same wait owes one choice
  assert.equal(isSupportNextStepOwed(595), true);
  // Another item is untouched — one record's reply never opens another's choice.
  assert.equal(isSupportNextStepOwed(596), false);
  closeSupportNextStep(595);
  assert.equal(isSupportNextStepOwed(595), false);
  closeSupportNextStep(595); // closing twice is a no-op
  assert.equal(isSupportNextStepOwed(595), false);
});
