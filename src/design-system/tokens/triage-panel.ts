/**
 * The chrome contract for controls INSIDE a `cornerClass('surface')` triage panel — one place that owns both axes a control is judged on…
 * Operator 2026-08-31: "ensure it's all under one token in terms of the sizing
 */

import { cn } from '@/utils/_cn';
import { TRIAGE_PANEL_INNER_CORNER } from './radius';

export { TRIAGE_PANEL_INNER_CORNER };

/** Height of every interactive control in a triage panel. */
const TRIAGE_PANEL_CONTROL_HEIGHT = 'h-9';

/** The whole contract as one `cn()`-ready string — height + corner. */
export function triagePanelControl(...extra: Parameters<typeof cn>): string {
  return cn(TRIAGE_PANEL_CONTROL_HEIGHT, TRIAGE_PANEL_INNER_CORNER, ...extra);
}

/** The END corners of a flush segmented strip inside a triage panel — a condition bar, a grade picker, any joined row of cells. */
// Empty: the hosts disagree on where it lands (a container in Paperwork, the
// end cells in ConditionPills), so rounding here would clip one of them. Kept
// as a named slot so call sites keep saying "this is a segmented strip".
export const TRIAGE_PANEL_SEGMENT_ENDS = '';
