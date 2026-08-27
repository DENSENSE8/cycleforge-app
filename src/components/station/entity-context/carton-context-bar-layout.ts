/** Compact only when identity + classify labels + actions actually collide. */
export const CLASSIFY_TOUCH_SLACK_PX = 4;
/** Extra room required before expanding dots back to labels (anti-flicker). */
export const CLASSIFY_EXPAND_HYSTERESIS_PX = 20;

type ClassifyCompactMeasure = {
  barWidth: number;
  identityWidth: number;
  /** Current classify cluster width (labels or dots, whatever is mounted). */
  classifyContentWidth: number;
  actionsWidth: number;
  currentlyCompact: boolean;
  /** Last measured width of the label-mode classify cluster. */
  labelClassifyWidth: number;
};

/**
 * Collapse urgency · platform · type to dots only when those labels would
 * touch identity or actions — not at a guessed bar-width cutoff (720-wide
 * Displays used to always compact because 720 < 760).
 */
export function resolveClassifyCompact(m: ClassifyCompactMeasure): boolean {
  const labelsWidth = m.currentlyCompact ? m.labelClassifyWidth : m.classifyContentWidth;
  if (labelsWidth <= 0) return m.currentlyCompact;
  const needed = m.identityWidth + labelsWidth + m.actionsWidth;
  if (!m.currentlyCompact) {
    return needed > m.barWidth - CLASSIFY_TOUCH_SLACK_PX;
  }
  return needed > m.barWidth - CLASSIFY_TOUCH_SLACK_PX - CLASSIFY_EXPAND_HYSTERESIS_PX;
}
