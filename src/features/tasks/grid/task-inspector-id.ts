/**
 * The task desk's right-rail occupant id — ONE id for the plane, never one per
 * row. A per-row id stacks a new occupant on every click and leaves the
 * previous task's detail underneath it.
 *
 * Its own module because two files need it and neither may import the other:
 * the registered table definition names the occupant a row click opens, and
 * the inspector claims that slot. The literal used to be spelled in both,
 * which is a rename waiting to half-land.
 */
export const TASK_INSPECTOR_RAIL_ID = 'detail:task';
