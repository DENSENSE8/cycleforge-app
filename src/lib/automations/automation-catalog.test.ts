/**
 * The catalog is only trustworthy while every cron-triggered entry still names
 * a REAL job. This test is that pin — delete `tickets.designated_assign` from
 * `CRON_JOBS` and the catalog fails here rather than painting a row on
 * /studio/automations whose health can never be anything but "never".
 *
 *   npx tsx --test src/lib/automations/automation-catalog.test.ts
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTOMATION_CATALOG,
  automationForCronJob,
  automationsByTrigger,
} from '@/lib/automations/automation-catalog';
import { CRON_JOBS_BY_KEY, CRON_JOB_TRIGGER_PATH } from '@/lib/cron/registry';

test('every cron-triggered automation names a job that exists in CRON_JOBS', () => {
  const { cron } = automationsByTrigger();
  assert.ok(cron.length > 0, 'the catalog ships at least one cron automation');
  for (const automation of cron) {
    assert.equal(automation.trigger.kind, 'cron');
    const jobKey = automation.trigger.kind === 'cron' ? automation.trigger.jobKey : '';
    assert.ok(
      CRON_JOBS_BY_KEY[jobKey],
      `${automation.id} points at cron job "${jobKey}", which is not in CRON_JOBS`,
    );
  }
});

test('catalog ids are unique', () => {
  const ids = AUTOMATION_CATALOG.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate automation id in ${ids.join(', ')}`);
});

test('automationForCronJob resolves the designated-tag job', () => {
  const found = automationForCronJob('tickets.designated_assign');
  assert.ok(found, 'the designated-tag cron job has a catalog entry');
  assert.equal(found.id, 'tickets.designated-assign');
  assert.equal(found.trigger.kind, 'cron');
  assert.match(found.gate, /Zendesk/, 'the gate sentence names what turns it on');
  assert.equal(automationForCronJob('not.a.real.job'), undefined);
});

test('a cron automation the operator can see is a job "Run now" can actually trigger', () => {
  for (const automation of automationsByTrigger().cron) {
    const jobKey = automation.trigger.kind === 'cron' ? automation.trigger.jobKey : '';
    assert.ok(
      CRON_JOB_TRIGGER_PATH[jobKey],
      `${automation.id} has no manual trigger path — the Run now button would be a lie`,
    );
  }
});

test('event-triggered automations carry the href their rules live at', () => {
  for (const automation of automationsByTrigger().event) {
    assert.ok(automation.href, `${automation.id} is event-fired but names no config href`);
  }
});
