export type DashboardCategory = 'all' | 'tested' | 'picked' | 'repair' | 'outOfStock' | 'pendingLate' | 'fba';

export interface DashboardData {
  /* VALUE ONLY. `delta` was removed 2026-09-16: */
  summary: Record<DashboardCategory, { value: number }>;
  staffProgress: {
    staffId: number;
    name: string;
    goal: number;
    current: number;
    percent: number;
    status: 'on_track' | 'at_risk' | 'behind';
    daysLate: number;
    station: string;
  }[];
  activityFeed: {
    id: string;
    timestamp: string;
    type: string;
    source: string;
    summary: string;
    staff_id?: number;
    actor_name?: string;
  }[];
}
