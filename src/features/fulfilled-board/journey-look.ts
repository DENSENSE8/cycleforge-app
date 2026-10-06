/**
 * Each bucket tone's face on the Fulfilled board, as `stage-look.ts` is the
 * Live feed's: the column's top bar, the rail's bar, the headline ink and the
 * open card's outline all read one map, built from the house state tones
 * (`STATE_TONE_CLASSES`) — the colour alone says how bad a column is.
 */

import { STATE_TONE_CLASSES } from '@/design-system/tokens/lifecycle';
import type { NavLocateBucket } from '@/lib/nav/context/schema';

export type JourneyTone = NavLocateBucket['tone'];

export interface JourneyLook {
  /** Solid fill — the column's and the rail's thin top bar. */
  bar: string;
  /** Ink on the ground — a headline figure, an `over` count. */
  ink: string;
  /** Border colour of the open card's outline overlay (`STATE_OUTLINE_CLASS`) — geometry, never a ring. */
  outline: string;
}

export const JOURNEY_LOOK: Readonly<Record<JourneyTone, JourneyLook>> = {
  danger: { bar: STATE_TONE_CLASSES.danger.dot, ink: STATE_TONE_CLASSES.danger.text, outline: STATE_TONE_CLASSES.danger.border },
  warning: { bar: STATE_TONE_CLASSES.warning.dot, ink: STATE_TONE_CLASSES.warning.text, outline: STATE_TONE_CLASSES.warning.border },
  info: { bar: STATE_TONE_CLASSES.info.dot, ink: STATE_TONE_CLASSES.info.text, outline: STATE_TONE_CLASSES.info.border },
  success: { bar: STATE_TONE_CLASSES.success.dot, ink: STATE_TONE_CLASSES.success.text, outline: STATE_TONE_CLASSES.success.border },
  neutral: { bar: STATE_TONE_CLASSES.neutral.dot, ink: STATE_TONE_CLASSES.neutral.text, outline: STATE_TONE_CLASSES.neutral.border },
};
