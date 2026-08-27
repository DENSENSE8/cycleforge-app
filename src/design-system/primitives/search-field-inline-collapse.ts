/**
 * When the find-field well is too narrow for in-well filter status, hide the
 * label and leave only the funnel's hot dot. Observe the WELL, never the
 * collapsing label — measuring the output closes a ResizeObserver loop.
 */

/** Below this the well cannot host a word + clear; always compact. */
export const SEARCH_INLINE_MIN_WELL_PX = 64;
/** Touch slack before collapsing from the expanded face. */
export const SEARCH_INLINE_SLACK_PX = 4;
/** Extra room required before expanding the label back (anti-flicker). */
export const SEARCH_INLINE_HYSTERESIS_PX = 16;

export function resolveSearchInlineCompact(args: {
  wellWidth: number;
  contentWidth: number;
  currentlyCompact: boolean;
}): boolean {
  if (args.wellWidth < SEARCH_INLINE_MIN_WELL_PX) return true;
  if (args.contentWidth <= 0) return args.currentlyCompact;
  const needed = args.contentWidth + SEARCH_INLINE_SLACK_PX;
  if (!args.currentlyCompact) return args.wellWidth < needed;
  return args.wellWidth < needed + SEARCH_INLINE_HYSTERESIS_PX;
}

/**
 * Trailing chips sit in flow (left of paste), so hiding them grows the well.
 * Measure the stable host = well + currently-visible chips, and treat the
 * chips plus the minimum type-in well as the content that must fit.
 */
export function resolveSearchTrailingCompact(args: {
  hostWidth: number;
  chipsWidth: number;
  currentlyCompact: boolean;
}): boolean {
  if (args.chipsWidth <= 0) return args.currentlyCompact;
  return resolveSearchInlineCompact({
    wellWidth: args.hostWidth,
    contentWidth: args.chipsWidth + SEARCH_INLINE_MIN_WELL_PX,
    currentlyCompact: args.currentlyCompact,
  });
}
