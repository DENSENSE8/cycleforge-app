/**
 * Panel honesty — an answer may point at the side panel only when this turn
 * actually opened something there.
 *
 * Data renders INLINE in the chat (`artifact-placement.ts`); only a document
 * (or a ticket conversation, a reply draft, an import check) opens the right
 * rail. So "it's on the panel" is true only for a turn that opened a RAIL
 * artifact — for inline data it points the operator at an empty side of the
 * screen, and for a turn that showed nothing it promises data that never came.
 *
 * Measured failure (operator, 2026-09-26): "Where is SKU …?" → "the location
 * is shown in the panel", with no tool result and no artifact behind it. The
 * system prompt forbids the claim; this is the server-side check for when a
 * model makes it anyway. It is deliberately narrow: it fires only on an
 * AFFIRMATIVE panel claim, and it appends a correction instead of rewriting
 * the model's words (the answer has already streamed).
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

/** Every correction opens with this — the eval strips it to judge the model's own words. */
export const CORRECTION_PREFIX = 'Correction:';

/** The turn showed nothing at all. One sentence, no blame, no vendor. */
export const PANEL_CLAIM_CORRECTION = `${CORRECTION_PREFIX} nothing was shown for this answer — only the text above came back from the lookup.`;

/** The turn showed data, inline, and opened nothing on the side. */
export const INLINE_CLAIM_CORRECTION = `${CORRECTION_PREFIX} the result is shown right here in the chat, not on a side panel.`;

/** What a turn put on screen: `inline` data and `rail` documents (`artifact-placement.ts`). */
export interface TurnShown {
  inline: number;
  rail: number;
}

/**
 * The correction to append, or null when the answer is honest: it makes no
 * panel claim, or the turn really did open something on the right.
 */
export function panelClaimCorrection(answer: string, shown: TurnShown): string | null {
  if (shown.rail > 0 || !claimsPanelContent(answer)) return null;
  return shown.inline > 0 ? INLINE_CLAIM_CORRECTION : PANEL_CLAIM_CORRECTION;
}
