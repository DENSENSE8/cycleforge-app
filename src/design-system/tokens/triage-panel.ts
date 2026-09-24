/**
 * The chrome contract for controls INSIDE a `cornerClass('surface')` triage
 * panel — one place that owns both axes a control is judged on when it sits
 * beside another one: its corner and its height.
 *
 * Operator 2026-08-31: "ensure it's all under one token in terms of the sizing
 * display — the create and the link-existing catalog item must be displayed the
 * same." They were not. The picker trigger carried `h-9` (the `ui/input`
 * height) and the button beside it carried `Button size="md"` → `h-8`. Two
 * controls on one row, one pixel apart in height, each individually defensible
 * — which is exactly how that mismatch survives review. A shared token removes
 * the judgement call: a control in a triage panel is this tall and this round,
 * and there is nowhere to disagree.
 *
 * Radius lives in `radius.ts` because that is the radius axis
 * ({@link TRIAGE_PANEL_INNER_CORNER}, a named exemption beside its two
 * siblings). This module composes it with the height rather than restating it,
 * so the two can never drift.
 */

import { cn } from '@/utils/_cn';
import { TRIAGE_PANEL_INNER_CORNER } from './radius';

export { TRIAGE_PANEL_INNER_CORNER };

/**
 * Height of every interactive control in a triage panel.
 *
 * `h-9` and not `h-8`: `ui/input` is `h-9` and a panel is mostly fields, so
 * this is the height the surface already reads at — the buttons and pickers
 * come up to meet the fields, not the other way round.
 */
export const TRIAGE_PANEL_CONTROL_HEIGHT = 'h-9';

/**
 * The whole contract as one `cn()`-ready string — height + corner.
 *
 * Use it on every control in a triage panel (fields, pickers, buttons), so a
 * row of mixed primitives lines up on both axes without a call site choosing:
 *
 *   <Button className={triagePanelControl()}>Create</Button>
 *   <Input  className={triagePanelControl('font-mono')} />
 */
export function triagePanelControl(...extra: Parameters<typeof cn>): string {
  return cn(TRIAGE_PANEL_CONTROL_HEIGHT, TRIAGE_PANEL_INNER_CORNER, ...extra);
}

/**
 * The END corners of a flush segmented strip inside a triage panel — a
 * condition bar, a grade picker, any joined row of cells. Put it on the strip
 * container; it reaches the first and last cell.
 *
 * Same radius as {@link TRIAGE_PANEL_INNER_CORNER}, applied as two halves so
 * only the outer edges round and the seams between cells stay square. The
 * alternative — `overflow-hidden` plus a radius on the container — trims each
 * cell's `ring-inset` at the curve and leaves the arc unstroked.
 *
 * ONE whole literal, deliberately. Tailwind finds candidates by scanning source
 * text, so a class assembled at runtime
 * (`` `[&>*:first-child]:${SOME_CORNER}` ``) never appears anywhere for the
 * scanner to find and the rule is simply not generated — the composed form has
 * to exist verbatim in a scanned file, and this is that file
 * (`@source '../design-system/**'` in globals.css).
 */
// Square since 2026-09-24 (one language, two densities): the strip's ends are
// flush like the panel around them. Kept as a named slot so call sites keep
// saying "this is a segmented strip"; the modes guard keeps it square.
export const TRIAGE_PANEL_SEGMENT_ENDS = '';
