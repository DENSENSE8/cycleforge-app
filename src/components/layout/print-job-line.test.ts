import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkItem } from '@/lib/background-work/store';
import { printJobLine, printJobTitle } from './print-job-line';

const job = (over: Partial<WorkItem>): WorkItem => ({ id: 'p', kind: 'print', label: 'FNSKU labels', status: 'running', startedAt: 0, ...over });

test('a counted run rolls its numbers; paused keeps them under a held lead', () => {
  assert.deepEqual(printJobLine(job({ done: 3, total: 12 })), { kind: 'count', lead: 'Printing', done: 3, total: 12, tone: 'accent' });
  assert.deepEqual(printJobLine(job({ status: 'paused', done: 3, total: 12 })), { kind: 'count', lead: 'Paused ·', done: 3, total: 12, tone: 'muted' });
});

test('an uncounted run (a zero total is no count) says the verb alone', () => {
  assert.deepEqual(printJobLine(job({ done: 0, total: 0 })), { kind: 'text', text: 'Printing…', tone: 'accent' });
  assert.deepEqual(printJobLine(job({ status: 'paused' })), { kind: 'text', text: 'Paused', tone: 'muted' });
});

test('settled runs say how they ended, counting what printed', () => {
  assert.deepEqual(printJobLine(job({ status: 'done', done: 12, total: 12 })), { kind: 'text', text: 'Printed 12 labels', tone: 'success' });
  assert.deepEqual(printJobLine(job({ status: 'done', done: 1, total: 1 })), { kind: 'text', text: 'Printed 1 label', tone: 'success' });
  assert.deepEqual(printJobLine(job({ status: 'done', message: 'Sent to the dialog' })), { kind: 'text', text: 'Sent to the dialog', tone: 'success' });
  assert.deepEqual(printJobLine(job({ status: 'cancelled', done: 4, total: 12 })), { kind: 'text', text: 'Cancelled at 4 of 12', tone: 'muted' });
  assert.deepEqual(printJobLine(job({ status: 'failed', message: 'Printer offline' })), { kind: 'text', text: 'Printer offline', tone: 'danger' });
});

test('the title leads with the FNSKU when the job names one, then where it prints', () => {
  assert.equal(printJobTitle(job({ detail: 'X002YGI3OJ', target: 'Packing bench' })), 'X002YGI3OJ → Packing bench');
  assert.equal(printJobTitle(job({ target: 'Packing bench' })), 'FNSKU labels → Packing bench');
  assert.equal(printJobTitle(job({})), 'FNSKU labels');
});
