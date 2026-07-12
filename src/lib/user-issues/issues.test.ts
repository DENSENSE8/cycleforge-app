import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  createReportedIssue,
  attachGithubIssue,
  resolveReportedIssue,
  type UserIssuesDeps,
} from './issues';

const ORG = '11111111-2222-3333-4444-555555555555';

function fakes(rows: Record<string, Array<Record<string, unknown>>> = {}) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const deps: UserIssuesDeps = {
    query: async (orgId, sql, params) => {
      assert.equal(orgId, ORG, 'every query is tenant-scoped to the caller org');
      calls.push({ sql, params });
      if (/SELECT id FROM user_reported_issues/.test(sql)) {
        return { rows: rows.existing ?? [], rowCount: (rows.existing ?? []).length };
      }
      if (/INSERT INTO user_reported_issues/.test(sql)) {
        return { rows: [{ id: 101 }], rowCount: 1 };
      }
      if (/SELECT id, reporter_staff_id, title, status/.test(sql)) {
        return { rows: rows.found ?? [], rowCount: (rows.found ?? []).length };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  return { deps, calls };
}

test('createReportedIssue inserts and returns the new id', async () => {
  const { deps, calls } = fakes();
  const created = await createReportedIssue(
    ORG,
    { reporterStaffId: 7, issueType: 'bug', title: '  Broken thing  ', description: ' It broke ', pagePath: '/forge', clientEventId: 'evt-1' },
    deps,
  );
  assert.deepEqual(created, { id: 101, idempotent: false });
  const insert = calls.find((c) => /INSERT INTO/.test(c.sql));
  assert.ok(insert);
  assert.equal(insert.params[3], 'Broken thing', 'title trimmed');
  assert.equal(insert.params[4], 'It broke', 'description trimmed');
  assert.equal(insert.params[6], 'evt-1');
});

test('createReportedIssue replays on a duplicate clientEventId (idempotent)', async () => {
  const { deps, calls } = fakes({ existing: [{ id: 55 }] });
  const created = await createReportedIssue(
    ORG,
    { reporterStaffId: 7, issueType: 'bug', title: 'T', description: 'D', clientEventId: 'evt-dup' },
    deps,
  );
  assert.deepEqual(created, { id: 55, idempotent: true });
  assert.ok(!calls.some((c) => /INSERT INTO/.test(c.sql)), 'no second insert');
});

test('attachGithubIssue stamps number + url', async () => {
  const { deps, calls } = fakes();
  await attachGithubIssue(ORG, 101, { number: 42, url: 'https://github.com/x/y/issues/42' }, deps);
  const update = calls[0];
  assert.match(update.sql, /SET github_issue_number/);
  assert.deepEqual(update.params, [ORG, 101, 42, 'https://github.com/x/y/issues/42']);
});

test('resolveReportedIssue flips to deployed and reports the reporter for the toast', async () => {
  const { deps, calls } = fakes({ found: [{ id: 101, reporter_staff_id: 7, title: 'Broken thing', status: 'pending' }] });
  const res = await resolveReportedIssue(ORG, { githubIssueNumber: 42, resolutionCommit: 'abc1234' }, deps);
  assert.deepEqual(res, { ok: true, issueId: 101, reporterStaffId: 7, title: 'Broken thing', idempotent: false });
  const update = calls.find((c) => /SET status = 'deployed'/.test(c.sql));
  assert.ok(update);
  assert.deepEqual(update.params, [ORG, 101, 'abc1234']);
});

test('resolveReportedIssue is idempotent — already deployed → no update, no re-toast signal', async () => {
  const { deps, calls } = fakes({ found: [{ id: 101, reporter_staff_id: 7, title: 'T', status: 'deployed' }] });
  const res = await resolveReportedIssue(ORG, { issueId: 101 }, deps);
  assert.equal(res.ok, true);
  assert.equal((res as { idempotent: boolean }).idempotent, true);
  assert.ok(!calls.some((c) => /SET status/.test(c.sql)), 'no second status write');
});

test('resolve UPDATE is conditional (status <> deployed) — the TOCTOU loser is idempotent', async () => {
  // The pre-read says 'pending', but a concurrent resolve already flipped it:
  // the conditional UPDATE matches 0 rows → this call reports idempotent, so
  // only ONE toast fires even under a race.
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const deps = {
    query: async (_o: string, sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      if (/SELECT id, reporter_staff_id/.test(sql)) {
        return { rows: [{ id: 101, reporter_staff_id: 7, title: 'T', status: 'pending' }], rowCount: 1 };
      }
      if (/SET status = 'deployed'/.test(sql)) return { rows: [], rowCount: 0 }; // lost the race
      return { rows: [], rowCount: 1 };
    },
  };
  const res = await resolveReportedIssue(ORG, { issueId: 101 }, deps);
  assert.equal(res.ok, true);
  assert.equal((res as { idempotent: boolean }).idempotent, true, 'rowCount 0 → idempotent → no toast');
  const update = calls.find((c) => /SET status = 'deployed'/.test(c.sql));
  assert.match(update!.sql, /AND status <> 'deployed'/, 'the UPDATE is conditional (atomic flip)');
});

test('resolveReportedIssue: not_found and bad_input surface as typed errors', async () => {
  const { deps } = fakes({ found: [] });
  assert.deepEqual(await resolveReportedIssue(ORG, { issueId: 999 }, deps), { ok: false, error: 'not_found' });
  assert.deepEqual(await resolveReportedIssue(ORG, {}, deps), { ok: false, error: 'bad_input' });
  assert.deepEqual(await resolveReportedIssue(ORG, { issueId: -1 }, deps), { ok: false, error: 'bad_input' });
});
