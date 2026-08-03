/**
 * Shared types + constants for the Home ("/") mode switcher.
 *
 * Home is a Workbench (pick a mode → act in the region). `?mode=` in the URL is
 * the single source of truth — never a local `useState` (sidebar-mode law #1).
 * The five modes map to the home-ops-tv-collab-surfaces plan §3.1:
 *   today | tasks | collab | forge | brief
 *
 * Pure data only — no JSX. The mode LABELS and ICONS live in `SIDEBAR_PAGE_NAV`
 * (the house L2 SoT that `HeaderPageSwitcher` renders); this module keeps only
 * the vocabulary + its parser, which that registry's `resolveChild` imports so
 * the two can never disagree.
 */

export type HomeMode = 'today' | 'inbox' | 'tasks' | 'collab' | 'forge' | 'brief';

export const DEFAULT_HOME_MODE: HomeMode = 'today';

export function parseHomeMode(raw: string | null | undefined): HomeMode {
  return raw === 'inbox' ||
    raw === 'tasks' ||
    raw === 'collab' ||
    raw === 'forge' ||
    raw === 'brief'
    ? raw
    : 'today';
}

/**
 * URL params owned by a specific mode. Cleared on a mode switch so each mode
 * lands on a clean default (sidebar-mode law #4). These are the selection SoT
 * for the follow-up wiring phases (plan §3.1):
 *   ?task=   selected `ops_plan_tasks.id`   (tasks / collab)
 *   ?plan=   selected `ops_plans.id`        (tasks)
 *   ?view=   forge sub-view, e.g. `live`    (forge)
 *   ?q=      mode-scoped search             (today / tasks)
 *   ?open=   right-pane focus key           (tasks / collab)
 *   ?filter= inbox triage filter            (inbox)
 */
