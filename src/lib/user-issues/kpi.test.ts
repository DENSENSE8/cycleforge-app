import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aggregateReportedIssuesKpis,
  formatMedianDeployLabel,
} from '@/lib/user-issues/kpi';
import type { ReportedIssue } from '@/lib/user-issues/issues';

function issue(partial: Partial<ReportedIssue> & Pick<ReportedIssue, 'id' | 'status'>): ReportedIssue {
  return {
    reporterStaffId: null,
    reporterName: null,
    issueType: 'bug',
    title: 't',
    description: '',
    pagePath: null,
    githubIssueNumber: null,
    githubIssueUrl: null,
    resolutionCommit: null,
    resolvedAt: null,
    clientEventId: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...partial,
  };
}

test('aggregateReportedIssuesKpis counts open / in-progress / deployed-7d', () => {
  const now = Date.parse('2026-07-15T12:00:00.000Z');
  const kpis = aggregateReportedIssuesKpis(
    [
      issue({ id: 1, status: 'pending' }),
      issue({ id: 2, status: 'pending' }),
      issue({ id: 3, status: 'in-progress' }),
      issue({
        id: 4,
        status: 'deployed',
        createdAt: '2026-07-10T00:00:00.000Z',
        resolvedAt: '2026-07-14T00:00:00.000Z',
      }),
      issue({
        id: 5,
        status: 'deployed',
        createdAt: '2026-06-01T00:00:00.000Z',
        resolvedAt: '2026-06-02T00:00:00.000Z',
      }),
    ],
    now,
  );
  assert.equal(kpis.open, 2);
  assert.equal(kpis.inProgress, 1);
  assert.equal(kpis.deployed7d, 1);
  // medians of 96h and 24h → 60h
  assert.equal(kpis.medianHoursToDeploy, 60);
});

test('formatMedianDeployLabel', () => {
  assert.equal(formatMedianDeployLabel(null), '—');
  assert.equal(formatMedianDeployLabel(6), '6h');
  assert.equal(formatMedianDeployLabel(48), '2d');
});
