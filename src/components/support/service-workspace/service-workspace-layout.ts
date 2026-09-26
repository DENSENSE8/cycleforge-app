/** Layout tokens for the Workbench branch `service-workspace`. */

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

/** There is deliberately NO context-column token here. */
