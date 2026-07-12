'use client';

/**
 * Shared client bits for the Operations ▸ Plans mode (sidebar list + right
 * pane detail). Data comes from the existing /api/ops-plans routes; live
 * refresh rides the org `ops_plans:changes` channel (no polling — the
 * master-plan bridge and every plan mutation publish `ops_plan.updated`).
 */

import type { PlanRow, PlanDetail } from '@/lib/ops-plans/types';
import { MASTER_PLAN_OPS_TITLE } from '@/lib/master-plan/ops-plans-bridge-constants';

export const OPS_PLANS_LIST_KEY = ['ops-plans', 'list'] as const;
export const opsPlanDetailKey = (planId: string) => ['ops-plans', 'detail', planId] as const;

/** Re-export: sole bridge identity for the agentic-loop Neon projection. */
export { MASTER_PLAN_OPS_TITLE };

/** Operations ▸ Plans live console for the bridged agentic-loop plan. */
export function agenticLoopLiveHref(planId: string): string {
  const params = new URLSearchParams({ mode: 'plans', open: planId, view: 'live' });
  return `/operations?${params.toString()}`;
}

export const PLAN_STATUS_TONE: Record<string, string> = {
  draft: 'bg-surface-sunken text-text-muted ring-border-soft',
  active: 'bg-blue-50 text-blue-700 ring-blue-200',
  paused: 'bg-amber-50 text-amber-700 ring-amber-200',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  archived: 'bg-surface-sunken text-text-faint ring-border-soft',
};

export const TASK_STATUS_DOT: Record<string, { dot: string; label: string }> = {
  open: { dot: 'bg-amber-500', label: 'Open' },
  in_progress: { dot: 'bg-blue-500', label: 'In progress' },
  done: { dot: 'bg-emerald-500', label: 'Done' },
  canceled: { dot: 'bg-surface-inverse-soft', label: 'Canceled' },
};

export async function fetchPlansList(q: string): Promise<{ plans: PlanRow[]; total: number }> {
  const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  const res = await fetch(`/api/ops-plans${qs}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load plans (${res.status})`);
  return (await res.json()) as { plans: PlanRow[]; total: number };
}

export async function fetchPlanDetail(planId: string): Promise<PlanDetail> {
  const res = await fetch(`/api/ops-plans/${planId}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 404 ? 'Plan not found' : `Failed to load plan (${res.status})`);
  return (await res.json()) as PlanDetail;
}
