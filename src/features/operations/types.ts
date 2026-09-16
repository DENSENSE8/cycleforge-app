export type DashboardCategory = 'all' | 'tested' | 'repair' | 'outOfStock' | 'pendingLate' | 'fba';

export interface DashboardData {
  /*
   * VALUE ONLY. `delta` was removed 2026-09-16: `/api/dashboard/operations`
   * computed it as today-so-far ÷ all-of-yesterday, so every tile read down in
   * the morning and up in the evening regardless of the floor, and three of
   * the six were hardcoded `0`. The type change is the enforcement — no
   * consumer can paint a comparison the API does not measure.
   */
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
