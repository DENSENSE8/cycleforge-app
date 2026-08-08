'use client';

/**
 * Shared client bits for the Operations ▸ Plans mode.
 *
 * Reduced to the task status-dot map — its only consumer is
 * `features/home/HomeTasksMode.tsx`. The query keys, fetchers,
 * `agenticLoopLiveHref`, `PLAN_STATUS_TONE`, and the
 * `MASTER_PLAN_OPS_TITLE` re-export were deleted 2026-08-08 (no
 * importers; `PlansSidebar.tsx`, which owned them, is gone). The bridge
 * identity's one home is `@/lib/master-plan/ops-plans-bridge-constants`.
 */

export const TASK_STATUS_DOT: Record<string, { dot: string; label: string }> = {
  open: { dot: 'bg-amber-500', label: 'Open' },
  in_progress: { dot: 'bg-blue-500', label: 'In progress' },
  done: { dot: 'bg-emerald-500', label: 'Done' },
  canceled: { dot: 'bg-surface-inverse-soft', label: 'Canceled' },
};
