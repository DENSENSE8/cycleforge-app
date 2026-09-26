/** The Automations surface must ANSWER the operator's four questions for the designated-tag job — cadence, gate, health, counters — and… */

import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AutomationsList } from '@/components/studio/AutomationsView';
import {
  AUTOMATION_CATALOG,
  automationForCronJob,
  type AutomationDef,
} from '@/lib/automations/automation-catalog';
import type { CronJobStatus } from '@/lib/queries/cron-runs-queries';

const DESIGNATED = automationForCronJob('tickets.designated_assign') as AutomationDef;

const okStatus: CronJobStatus = {
  job: 'tickets.designated_assign',
  label: 'Designated-tag ticket assign',
  category: 'Integrations',
  schedule: 'every 15 min',
  health: 'ok',
  lastRun: {
    status: 'success',
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    finishedAt: new Date(Date.now() - 59_000).toISOString(),
    durationMs: 1200,
    summary: { orgs: 1, orgsFailed: 0, scanned: 12, assigned: 3, skipped: 8, ambiguous: 1, limit: 200 },
    error: null,
  },
};

test('a cron automation states its cadence, its gate, its health and its run counters', () => {
  const html = renderToStaticMarkup(
    <AutomationsList
      automations={[DESIGNATED]}
      statusByJob={{ 'tickets.designated_assign': okStatus }}
    />,
  );
  assert.match(html, /Every 15 minutes/, 'cadence in operator words');
  assert.match(html, /tickets\.designated_assign/, 'the job key it joins live health on');
  assert.match(html, /Always on for any org with an active Zendesk integration/, 'the gate sentence');
  assert.match(html, /Healthy/, 'health chip from the live summary');
  assert.match(html, /assigned 3/, 'the run counter the operator cares about');
  assert.match(html, /ambiguous 1/);
  assert.match(html, /Last run/);
});

test('run counters are read generically — a summary missing this job’s fields still renders', () => {
  const sparse: CronJobStatus = {
    ...okStatus,
    health: 'stale',
    lastRun: { ...okStatus.lastRun!, summary: { orgs: 1 }, error: null },
  };
  const html = renderToStaticMarkup(
    <AutomationsList automations={[DESIGNATED]} statusByJob={{ 'tickets.designated_assign': sparse }} />,
  );
  assert.match(html, /orgs 1/);
  assert.doesNotMatch(html, /assigned/, 'no counter is invented for a field the run never wrote');
  assert.match(html, /Overdue/, 'stale reads as Overdue, not as a green face');
});

test('a null summary and a string summary paint no counters instead of throwing', () => {
  for (const summary of [null, 'done', ['a'], 42]) {
    const html = renderToStaticMarkup(
      <AutomationsList
        automations={[DESIGNATED]}
        statusByJob={{
          'tickets.designated_assign': { ...okStatus, lastRun: { ...okStatus.lastRun!, summary } },
        }}
      />,
    );
    assert.match(html, /Last run/);
  }
});

test('an unjoined cron row never claims health it does not have', () => {
  const loading = renderToStaticMarkup(
    <AutomationsList automations={[DESIGNATED]} statusByJob={{}} statusPending />,
  );
  assert.match(loading, /Checking…/);
  assert.doesNotMatch(loading, /Never run|Healthy/);

  const failed = renderToStaticMarkup(
    <AutomationsList automations={[DESIGNATED]} statusByJob={{}} statusError />,
  );
  assert.match(failed, /Health unavailable/);

  const absent = renderToStaticMarkup(<AutomationsList automations={[DESIGNATED]} statusByJob={{}} />);
  assert.match(absent, /Not reporting/, 'a job the runs API does not list is not silently "Healthy"');
});

test('Run now is offered only to a viewer who may trigger the job', () => {
  const without = renderToStaticMarkup(
    <AutomationsList automations={[DESIGNATED]} statusByJob={{ 'tickets.designated_assign': okStatus }} />,
  );
  assert.doesNotMatch(without, /Run now/);

  const with_ = renderToStaticMarkup(
    <AutomationsList
      automations={[DESIGNATED]}
      statusByJob={{ 'tickets.designated_assign': okStatus }}
      canRunNow
    />,
  );
  assert.match(with_, /Run now/);
});

test('an event automation offers its rules href, never a Run now button', () => {
  const event = AUTOMATION_CATALOG.find((a) => a.trigger.kind === 'event') as AutomationDef;
  const html = renderToStaticMarkup(
    <AutomationsList automations={[event]} statusByJob={{}} canRunNow />,
  );
  assert.doesNotMatch(html, /Run now/, 'there is no clock to advance on an event automation');
  assert.match(html, /Event-fired/);
  assert.match(html, new RegExp(`href="${event.href}"`));
  assert.match(html, /On order\.item_number_set/);
});

test('an empty catalog says so instead of painting an empty list', () => {
  const html = renderToStaticMarkup(<AutomationsList automations={[]} statusByJob={{}} />);
  assert.match(html, /Nothing runs by itself yet/);
});
