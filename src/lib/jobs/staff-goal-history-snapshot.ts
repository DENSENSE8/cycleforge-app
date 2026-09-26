import { snapshotStaffGoalHistoryForDate } from '@/lib/neon/staff-goals-queries';
import { listSweepOrgIds } from '@/lib/cron/for-each-org';

export interface StaffGoalHistorySnapshotPayload {
  loggedDate?: string;
}

function getPacificDateStamp(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Failed to derive Pacific date stamp');
  }

  return `${year}-${month}-${day}`;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function runStaffGoalHistorySnapshotJob(
  payload: StaffGoalHistorySnapshotPayload = {},
) {
  const loggedDate = String(payload.loggedDate || getPacificDateStamp()).trim();
  if (!isIsoDate(loggedDate)) {
    throw new Error('loggedDate must be in YYYY-MM-DD format');
  }

  // Phase D: fan out per active org instead of one global snapshot pass.
  const orgIds = await listSweepOrgIds();
  const uniqueStaffIds = new Set<number>();
  const stations = new Set<string>();
  let snapshotRows = 0;
  let orgsFailed = 0;
  const errors: Array<{ orgId: string; error: string }> = [];

  for (const orgId of orgIds) {
    try {
      const rows = await snapshotStaffGoalHistoryForDate(loggedDate, undefined, orgId);
      snapshotRows += rows.length;
      for (const row of rows) {
        uniqueStaffIds.add(row.staff_id);
        stations.add(row.station);
      }
    } catch (err) {
      orgsFailed += 1;
      const error = err instanceof Error ? err.message : String(err);
      console.error(`[staff-goals/history] org ${orgId} failed:`, error);
      errors.push({ orgId, error });
    }
  }

  return {
    ok: orgsFailed === 0,
    loggedDate,
    snapshotRows,
    staffCount: uniqueStaffIds.size,
    stations: [...stations].sort(),
    orgsSwept: orgIds.length,
    orgsFailed,
    ...(errors.length > 0 ? { errors } : {}),
  };
}
