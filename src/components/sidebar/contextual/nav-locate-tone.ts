/**
 * A locate bucket's ink (`NavLocateBucket.tone`) — ONE map for every surface
 * that paints a bucket: the pills under the search field and the pasted-list
 * rows. Status colour vars only (the ones `StatusBadge` reads), never a hue
 * literal.
 */

import type { NavLocateBucket } from '@/lib/nav/context/schema';

type Tone = NavLocateBucket['tone'];

/** CSS colour var per tone. */
export const NAV_LOCATE_TONE_VAR: Readonly<Record<Tone, string>> = {
  neutral: 'currentColor',
  info: 'var(--color-info)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-error)',
};
