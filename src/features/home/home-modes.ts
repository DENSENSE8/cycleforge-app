/**
 * Shared types + constants for the Home ("/") mode switcher.
 *
 * Home is a Workbench (pick a mode → act in the region). `?mode=` in the URL is
 * the single source of truth — never a local `useState` (sidebar-mode law #1).
 * The five modes map to the home-ops-tv-collab-surfaces plan §3.1:
 *   today | tasks | collab | forge | brief
 *
 * Pure data only — no JSX. Mirrors `operations-sidebar-shared.ts` so the Home
 * rail and the Operations rail stay one pattern.
 */

import { Activity, ClipboardList, MessageSquare, Zap, Sparkles } from '@/components/Icons';
import type { HorizontalSliderItem } from '@/components/ui/HorizontalButtonSlider';

export type HomeMode = 'today' | 'tasks' | 'collab' | 'forge' | 'brief';

/**
 * The top-level mode rail. `today` is the default and stays on the bare `/`
 * path (no `?mode=`); the other modes flip `?mode=`. Labels follow the plan's
 * staff mental model (§1.1): "Plan" is the operator-facing label for the forge
 * (live product plan) mode.
 */
export const HOME_MODE_ITEMS: HorizontalSliderItem[] = [
  { id: 'today', label: 'Today', icon: Activity },
  { id: 'tasks', label: 'Tasks', icon: ClipboardList },
  { id: 'collab', label: 'Collab', icon: MessageSquare },
  { id: 'forge', label: 'Plan', icon: Zap },
  { id: 'brief', label: 'Brief', icon: Sparkles },
];

export const DEFAULT_HOME_MODE: HomeMode = 'today';

export function parseHomeMode(raw: string | null | undefined): HomeMode {
  return raw === 'tasks' || raw === 'collab' || raw === 'forge' || raw === 'brief'
    ? raw
    : 'today';
}

export function homeModeLabel(mode: HomeMode): string {
  return HOME_MODE_ITEMS.find((item) => item.id === mode)?.label ?? 'Today';
}

/**
 * URL params owned by a specific mode. Cleared on a mode switch so each mode
 * lands on a clean default (sidebar-mode law #4). These are the selection SoT
 * for the follow-up wiring phases (plan §3.1):
 *   ?task=  selected `ops_plan_tasks.id`   (tasks / collab)
 *   ?plan=  selected `ops_plans.id`        (tasks)
 *   ?view=  forge sub-view, e.g. `live`    (forge)
 *   ?q=     mode-scoped search             (today / tasks)
 *   ?open=  right-pane focus key           (tasks / collab)
 */
export const HOME_MODE_SCOPED_PARAMS = ['task', 'plan', 'view', 'q', 'open'] as const;
