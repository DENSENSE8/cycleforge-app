import type { PackingKpiSummary } from '@/lib/packing/packer-kpi-queries';
import type { PackingReportRow } from '@/lib/packing/packing-report-shared';

export type MeasuredOperationKind = 'pick' | 'pack';

export interface MeasuredOperation {
  key: string;
  kind: MeasuredOperationKind;
  staffId: number | null;
  staffName: string | null;
  title: string;
  subtitle: string | null;
  startedAt: string | null;
  completedAt: string;
  durationSeconds: number | null;
  href: string | null;
}

export interface ActiveOperation {
  key: string;
  kind: MeasuredOperationKind;
  staffId: number;
  staffName: string | null;
  title: string;
  startedAt: string;
  href: string | null;
}

export interface StaffOperationsReport {
  staffId: number | null;
  staffName: string;
  pickCount: number;
  packCount: number;
  medianPickSeconds: number | null;
  medianPackSeconds: number | null;
  activeOperations: ActiveOperation[];
}

export interface OperationsReportPayload {
  ok: true;
  day: string;
  generatedAt: string;
  packingSummary: PackingKpiSummary;
  packingRows: PackingReportRow[];
  summary: {
    pickCount: number;
    packCount: number;
    medianPickSeconds: number | null;
    medianPackSeconds: number | null;
    activePickCount: number;
    activePackCount: number;
  };
  staff: StaffOperationsReport[];
  activity: MeasuredOperation[];
  activeOperations: ActiveOperation[];
}

export interface OperationsStaffSeed {
  staffId: number;
  staffName: string;
}

export function medianOperationSeconds(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? Math.round((ordered[middle - 1] + ordered[middle]) / 2)
    : ordered[middle];
}

export function buildStaffOperationsReport(
  roster: readonly OperationsStaffSeed[],
  activity: readonly MeasuredOperation[],
  activeOperations: readonly ActiveOperation[],
): StaffOperationsReport[] {
  const byStaff = new Map<string, {
    staffId: number | null;
    staffName: string;
    pickDurations: number[];
    packDurations: number[];
    pickCount: number;
    packCount: number;
    activeOperations: ActiveOperation[];
  }>();

  const ensure = (staffId: number | null, staffName: string | null) => {
    const key = staffId == null ? 'unknown' : String(staffId);
    const existing = byStaff.get(key);
    if (existing) {
      if (existing.staffName === 'Unknown staff' && staffName?.trim()) existing.staffName = staffName.trim();
      return existing;
    }
    const created = {
      staffId,
      staffName: staffName?.trim() || (staffId == null ? 'Unknown staff' : `Staff #${staffId}`),
      pickDurations: [],
      packDurations: [],
      pickCount: 0,
      packCount: 0,
      activeOperations: [],
    };
    byStaff.set(key, created);
    return created;
  };

  for (const person of roster) ensure(person.staffId, person.staffName);
  for (const operation of activity) {
    const staff = ensure(operation.staffId, operation.staffName);
    if (operation.kind === 'pick') {
      staff.pickCount += 1;
      if (operation.durationSeconds != null) staff.pickDurations.push(operation.durationSeconds);
    } else {
      staff.packCount += 1;
      if (operation.durationSeconds != null) staff.packDurations.push(operation.durationSeconds);
    }
  }
  for (const operation of activeOperations) {
    ensure(operation.staffId, operation.staffName).activeOperations.push(operation);
  }

  return [...byStaff.values()]
    .map((row) => ({
      staffId: row.staffId,
      staffName: row.staffName,
      pickCount: row.pickCount,
      packCount: row.packCount,
      medianPickSeconds: medianOperationSeconds(row.pickDurations),
      medianPackSeconds: medianOperationSeconds(row.packDurations),
      activeOperations: row.activeOperations.sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    }))
    .sort((a, b) => {
      const activeDelta = b.activeOperations.length - a.activeOperations.length;
      if (activeDelta !== 0) return activeDelta;
      const workDelta = b.pickCount + b.packCount - (a.pickCount + a.packCount);
      return workDelta !== 0 ? workDelta : a.staffName.localeCompare(b.staffName);
    });
}
