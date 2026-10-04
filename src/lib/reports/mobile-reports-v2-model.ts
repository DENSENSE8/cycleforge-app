import type {
  ActiveOperation,
  MeasuredOperationKind,
  OperationsReportPayload,
  StaffOperationsReport,
} from '@/lib/reports/operations-report-contract';

export interface MobileReportStage {
  id: MeasuredOperationKind;
  label: string;
  completed: number;
  active: number;
  medianSeconds: number | null;
  p90Seconds: number | null;
  measured: number;
  coveragePercent: number;
}

export interface MobileReportAttention {
  id: 'capacity' | 'stale-work' | 'pack-coverage' | 'unknown-staff';
  title: string;
  detail: string;
  tone: 'warning' | 'danger';
}

export interface MobileReportStaffGroups {
  working: StaffOperationsReport[];
  completed: StaffOperationsReport[];
  idle: StaffOperationsReport[];
}

export interface MobileReportsV2Model {
  status: {
    label: 'On track' | 'At risk' | 'Behind' | 'Recorded day';
    tone: 'success' | 'warning' | 'danger' | 'neutral';
    summary: string;
  };
  completedOperations: number;
  standardMinutes: number;
  capacityMinutes: number;
  attention: MobileReportAttention[];
  stages: MobileReportStage[];
  staff: MobileReportStaffGroups;
}

const P90 = 0.9;
const STALE_OPERATION_MS = 90 * 60 * 1_000;

function percentile(values: readonly number[], position: number): number | null {
  if (values.length === 0) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(position * ordered.length) - 1);
  return ordered[index] ?? null;
}

function stage(payload: OperationsReportPayload, kind: MeasuredOperationKind): MobileReportStage {
  const operations = payload.activity.filter((row) => row.kind === kind);
  const durations = operations.flatMap((row) => row.durationSeconds == null ? [] : [row.durationSeconds]);
  return {
    id: kind,
    label: kind === 'pick' ? 'Picking' : 'Packing',
    completed: operations.length,
    active: payload.activeOperations.filter((row) => row.kind === kind).length,
    medianSeconds: percentile(durations, 0.5),
    p90Seconds: percentile(durations, P90),
    measured: durations.length,
    coveragePercent: operations.length === 0 ? 0 : Math.round((durations.length / operations.length) * 100),
  };
}

function staleOperations(active: readonly ActiveOperation[], now: number): ActiveOperation[] {
  return active.filter((row) => now - new Date(row.startedAt).getTime() >= STALE_OPERATION_MS);
}

export function buildMobileReportsV2Model(
  payload: OperationsReportPayload,
  options: { live: boolean; now: number },
): MobileReportsV2Model {
  const capacity = Math.max(1, payload.packingSummary.capacity.daily_capacity_minutes);
  const standardMinutes = payload.packingSummary.totals.weighted_minutes;
  const pendingMinutes = payload.packingSummary.fba.pending_weighted_minutes;
  const remainingMinutes = payload.packingSummary.totals.remaining_minutes;
  const overflowMinutes = Math.max(0, pendingMinutes - remainingMinutes);
  const stale = options.live ? staleOperations(payload.activeOperations, options.now) : [];
  const packing = stage(payload, 'pack');
  const attention: MobileReportAttention[] = [];

  if (options.live && overflowMinutes > 0) {
    attention.push({
      id: 'capacity',
      title: overflowMinutes > payload.packingSummary.capacity.workday_minutes ? 'Packing capacity is behind' : 'Packing capacity is at risk',
      detail: `${overflowMinutes.toLocaleString()} standard minutes of pending FBA work exceed today’s remaining pack capacity.`,
      tone: overflowMinutes > payload.packingSummary.capacity.workday_minutes ? 'danger' : 'warning',
    });
  }
  if (stale.length > 0) {
    attention.push({
      id: 'stale-work',
      title: `${stale.length} active ${stale.length === 1 ? 'operation needs' : 'operations need'} a check`,
      detail: 'The active timer has run for at least 90 minutes. Open the staff row to inspect the linked work.',
      tone: 'warning',
    });
  }
  if (packing.completed > 0 && packing.coveragePercent < 80) {
    attention.push({
      id: 'pack-coverage',
      title: 'Pack-time coverage is incomplete',
      detail: `${packing.measured} of ${packing.completed} completed packs have an observed duration. Medians exclude the rest.`,
      tone: 'warning',
    });
  }
  const unknown = payload.staff.find((row) => row.staffId == null && (row.pickCount + row.packCount + row.activeOperations.length > 0));
  if (unknown) {
    attention.push({
      id: 'unknown-staff',
      title: 'Completed work is missing staff identity',
      detail: `${unknown.pickCount + unknown.packCount} completed operations cannot be attributed to a rostered person.`,
      tone: 'warning',
    });
  }

  const status = (() => {
    if (!options.live) {
      return {
        label: 'Recorded day' as const,
        tone: 'neutral' as const,
        summary: `${payload.summary.pickCount + payload.summary.packCount} completed pick and pack operations are recorded for this day.`,
      };
    }
    if (attention.some((item) => item.tone === 'danger')) {
      return {
        label: 'Behind' as const,
        tone: 'danger' as const,
        summary: 'Pending standard pack work exceeds remaining capacity by more than one configured workday.',
      };
    }
    if (attention.length > 0) {
      return {
        label: 'At risk' as const,
        tone: 'warning' as const,
        summary: `${attention.length} ${attention.length === 1 ? 'condition needs' : 'conditions need'} attention before the end of the shift.`,
      };
    }
    return {
      label: 'On track' as const,
      tone: 'success' as const,
      summary: pendingMinutes > 0
        ? 'Pending FBA standard work fits within today’s remaining pack capacity.'
        : 'No measured capacity or active-session exception needs intervention.',
    };
  })();

  return {
    status,
    completedOperations: payload.summary.pickCount + payload.summary.packCount,
    standardMinutes,
    capacityMinutes: capacity,
    attention,
    stages: [stage(payload, 'pick'), packing],
    staff: {
      working: payload.staff.filter((row) => row.activeOperations.length > 0),
      completed: payload.staff.filter((row) => row.activeOperations.length === 0 && row.pickCount + row.packCount > 0),
      idle: payload.staff.filter((row) => row.activeOperations.length === 0 && row.pickCount + row.packCount === 0),
    },
  };
}

