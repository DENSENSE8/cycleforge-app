/**
 * Panel honesty — the answer may say "it's on the panel" only when this turn
 * actually put something there.
 *
 * Measured failure (operator, 2026-09-26): "Where is SKU …?" → "the location
 * is shown in the panel", with no tool result and no artifact behind it, so the
 * panel never opened and the operator had no location at all. The system
 * prompt forbids the claim; this is the server-side check for when a model
 * makes it anyway. It is deliberately narrow: it fires only on an AFFIRMATIVE
 * panel claim in a turn that emitted zero artifacts, and it appends a
 * correction instead of rewriting the model's words (the answer has already
 * streamed).
 */

/** A sentence that points the operator at the panel / side view. */
const PANEL_CLAIM =
  /\b(?:(?:on|in|to)\s+(?:the\s+)?(?:right[-\s]hand\s+|right\s+|side\s+|view\s+|session\s+)?panel|panel\s+(?:on\s+the\s+right|beside|to\s+the\s+right)|(?:see|check)\s+the\s+(?:table|panel)|(?:table|panel)\s+(?:is\s+)?(?:now\s+)?(?:shown|displayed|open(?:ed)?)|(?:shown|displayed|rendered|pulled\s+up|opened)\s+(?:it\s+|them\s+|this\s+|that\s+)?(?:on|in)\s+(?:the\s+)?(?:right|side))\b/i;

/** A sentence that DENIES the panel ("nothing to show on the panel") is true when nothing rendered. */
const NEGATION = /\b(?:no|nothing|not|never|none|without|empty)\b|n['’]t\b/i;

/** Whether `text` affirmatively tells the operator to look at the panel. */
export function claimsPanelContent(text: string): boolean {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .some((sentence) => PANEL_CLAIM.test(sentence) && !NEGATION.test(sentence));
}

/** The appended line when the claim is false. One sentence, no blame, no vendor. */
export const PANEL_CLAIM_CORRECTION =
  'Correction: nothing was put on the panel for this answer — only the text above came back from the lookup.';

/**
 * The correction to append, or null when the answer is honest: it makes no
 * panel claim, or the turn really did emit an artifact.
 */
export function panelClaimCorrection(answer: string, artifactsThisTurn: number): string | null {
  if (artifactsThisTurn > 0) return null;
  return claimsPanelContent(answer) ? PANEL_CLAIM_CORRECTION : null;
}
