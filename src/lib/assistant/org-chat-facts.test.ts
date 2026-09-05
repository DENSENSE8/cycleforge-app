/**
 * DB-free tests for org-scoped Ask facts.
 * Run: npx tsx --test src/lib/assistant/org-chat-facts.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { AiTimeframe } from '@/lib/ai/types';
import {
  classifyOrgChatQuestion,
  fetchOrgChatFacts,
  type OrgChatFactsDeps,
} from './org-chat-facts';

const ORG = '00000000-0000-0000-0000-000000000002';
const OTHER_ORG = '00000000-0000-0000-0000-000000000001';
const WEEK: AiTimeframe = {
  kind: 'this_week',
  label: 'This Week',
  exactLabel: 'Monday, March 23 to Friday, March 27 PST',
  start: '2026-03-23',
  end: '2026-03-27',
  timezone: 'America/Los_Angeles',
  explicit: true,
  weekOffset: 0,
};

interface Captured {
  sql: string[];
  params: unknown[][];
  orgs: string[];
}

function fakes(rowsByCall: Array<Array<Record<string, unknown>>>) {
  const cap: Captured = { sql: [], params: [], orgs: [] };
  let i = 0;
  const deps: OrgChatFactsDeps = {
    query: async (orgId, text, params) => {
      cap.orgs.push(orgId);
      cap.sql.push(text);
      cap.params.push([...(params ?? [])]);
      const rows = rowsByCall[i] ?? [];
      i += 1;
      return { rows };
    },
    timeframe: (message) => {
      assert.match(message, /packer|package|packed/i);
      return WEEK;
    },
  };
  return { deps, cap };
}

test('classifyOrgChatQuestion: this packer this week is session-scoped', () => {
  assert.equal(
    classifyOrgChatQuestion('how many packages were packed by this packer on this week?'),
    'session_packer_packages',
  );
  assert.equal(
    classifyOrgChatQuestion('How many packages did I pack today?'),
    'session_packer_packages',
  );
});

test('classifyOrgChatQuestion: packing count without this packer is org-wide', () => {
  assert.equal(
    classifyOrgChatQuestion('how many packages were packed this week?'),
    'org_packages',
  );
});

test('classifyOrgChatQuestion: ignores carton / product questions', () => {
  assert.equal(classifyOrgChatQuestion('tell me about this carton'), null);
  assert.equal(classifyOrgChatQuestion('what is in the box?'), null);
});

test('fetchOrgChatFacts: session packer threads org + staff; never interpolates the utterance', async () => {
  const utterance = "how many packages were packed by this packer on this week?; DROP TABLE packer_logs; --";
  const { deps, cap } = fakes([
    [{ name: 'QA Admin' }],
    [{ packed_count: 12 }],
  ]);
  const out = await fetchOrgChatFacts(
    { orgId: ORG, staffId: 67, message: utterance, kind: 'session_packer_packages' },
    deps,
  );

  assert.equal(cap.orgs[0], ORG);
  assert.equal(cap.orgs[1], ORG);
  assert.equal(cap.params[0][0], 67);
  assert.equal(cap.params[0][1], ORG);
  assert.deepEqual(cap.params[1], [ORG, 67, '2026-03-23', '2026-03-27']);
  for (const params of cap.params) {
    assert.equal(params.includes(utterance), false);
    assert.equal(params.some((p) => String(p).includes('DROP TABLE')), false);
  }
  assert.match(cap.sql[1], /packer_logs/);
  assert.match(cap.sql[1], /organization_id = \$1/);
  assert.match(cap.sql[1], /packed_by = \$2/);
  assert.match(out, /QA Admin/);
  assert.match(out, /Packages packed: 12/);
  assert.match(out, /this organization only/);
  assert.doesNotMatch(out, /\b67\b/);
  assert.match(out, /Operator: /);
});

test('fetchOrgChatFacts: no signed-in packer does not query packer_logs', async () => {
  const { deps, cap } = fakes([]);
  const out = await fetchOrgChatFacts(
    { orgId: ORG, staffId: null, message: 'how many packages were packed by this packer this week?', kind: 'session_packer_packages' },
    deps,
  );
  assert.equal(cap.sql.length, 0);
  assert.match(out, /No packer is signed in/);
  assert.doesNotMatch(out, /Packages packed:/);
});

test('fetchOrgChatFacts: staff missing from this org fails closed', async () => {
  const { deps, cap } = fakes([[]]);
  const out = await fetchOrgChatFacts(
    { orgId: ORG, staffId: 67, message: 'how many did this packer pack this week?', kind: 'session_packer_packages' },
    deps,
  );
  assert.equal(cap.sql.length, 1);
  assert.match(cap.sql[0], /FROM staff/);
  assert.equal(cap.params[0][1], ORG);
  assert.match(out, /No packer is signed in/);
});

test('fetchOrgChatFacts: org packages count is org-scoped and has no staff id', async () => {
  const { deps, cap } = fakes([[{ packed_count: 40 }]]);
  const out = await fetchOrgChatFacts(
    { orgId: ORG, staffId: 67, message: 'how many packages were packed this week?', kind: 'org_packages' },
    deps,
  );
  assert.equal(cap.sql.length, 1);
  assert.deepEqual(cap.params[0], [ORG, '2026-03-23', '2026-03-27']);
  assert.equal(cap.params[0].includes(OTHER_ORG), false);
  assert.doesNotMatch(cap.sql[0], /packed_by/);
  assert.match(out, /Packages packed: 40/);
  assert.doesNotMatch(out, /Packer:/);
});
