/**
 * Client-side KPI aggregation for the Reported-Issues Monitor rollup.
 * Pure helpers — no fetch. Fed by a short unfiltered list sample (UIC-2);
 * a dedicated counts endpoint can replace this later if volume grows.
 */

import type { ReportedIssue, UserIssueStatus } from '@/lib/user-issues/issues';

export interface ReportedIssuesKpis {
  open: number;
  inProgress: number;
  deployed7d: number;
  /** Median hours from create → resolve among deployed rows with both timestamps; null if none. */
  medianHoursToDeploy: number | null;
}

const MS_PER_HOUR = 3_600_000;
const MS_7D = 7 * 24 * MS_PER_HOUR;

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function aggregateReportedIssuesKpis(
  issues: ReportedIssue[],
  nowMs: number = Date.now(),
): ReportedIssuesKpis {
  let open = 0;
  let inProgress = 0;
  let deployed7d = 0;
  const deployHours: number[] = [];

  for (const issue of issues) {
    const status: UserIssueStatus = issue.status;
    if (status === 'pending') open += 1;
    else if (status === 'in-progress') inProgress += 1;
    else if (status === 'deployed') {
      const resolvedMs = issue.resolvedAt ? Date.parse(issue.resolvedAt) : NaN;
      if (Number.isFinite(resolvedMs) && nowMs - resolvedMs <= MS_7D) {
        deployed7d += 1;
      }
      const createdMs = Date.parse(issue.createdAt);
      if (Number.isFinite(resolvedMs) && Number.isFinite(createdMs) && resolvedMs >= createdMs) {
        deployHours.push((resolvedMs - createdMs) / MS_PER_HOUR);
      }
    }
  }

  deployHours.sort((a, b) => a - b);
  const med = median(deployHours);

  return {
    open,
    inProgress,
    deployed7d,
    medianHoursToDeploy: med == null ? null : Math.round(med * 10) / 10,
  };
}

export function formatMedianDeployLabel(hours: number | null): string {
  if (hours == null) return '—';
  if (hours < 24) return `${hours}h`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days}d`;
}
