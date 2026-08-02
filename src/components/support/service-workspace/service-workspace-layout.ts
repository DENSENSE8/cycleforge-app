/**
 * Layout tokens for the Workbench branch `service-workspace`.
 *
 * Law: `.claude/rules/display/workbench-service.md`. Geometry lives here so the
 * shell and its panes cannot drift apart, and so a second Support surface
 * composes the numbers instead of re-typing them.
 */

/** Root row — the three panes are flex siblings on the work canvas. */
export const SERVICE_WORKSPACE_ROOT_CLASS =
  'flex h-full min-h-0 w-full bg-surface-canvas';

/**
 * The queue map. `min-w-0` so a wide child (the board's chrome header) cannot
 * force the row to overflow instead of shrinking.
 */
export const SERVICE_WORKSPACE_LIST_CLASS =
  'flex min-h-0 min-w-0 flex-1 flex-col';

/** The thread — the singular focus surface, and the only pane that crossfades. */
export const SERVICE_WORKSPACE_THREAD_CLASS =
  'relative flex min-h-0 min-w-0 flex-1 flex-col';

/**
 * There is deliberately NO context-column token here.
 *
 * One existed (`SERVICE_WORKSPACE_CONTEXT_CLASS`, a hand-rolled
 * `w-[20rem] shrink-0 … border-l`) until 2026-08-01. Ticket context is a
 * `RightRailHost` occupant — `SupportContextDetailPanel` — and that host owns
 * the width, the resize grip, the collapse strip and the push tween. A geometry
 * token for a second right column is how a surface grows a competing right edge,
 * so its absence is the point rather than an omission.
 */
