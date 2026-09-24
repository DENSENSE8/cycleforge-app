import { baseColors } from './primitives';

/**
 * State / functional colours — mode-independent and platform-independent.
 * A state colour says what a thing IS (ready, needs attention, packed,
 * blocked, done); no mode, surface or platform restyles it.
 *
 * Each tone follows the documented family rule: text -600 / tint (pastel
 * surface) -50 / edge (border) -400, plus a solid `fill` for bars, spines and
 * saturated indicators. The light theme's `--ds-color-{text,surface,border,
 * fill}-<tone>` vars read these values (light.ts) — this is the one copy.
 *
 * Text is not fill for success and warning: green-600 (3.30:1) and orange-600
 * (3.56:1) fail the 4.5:1 text floor on white (BRIEF §8), so their TEXT ink is
 * the -700 step — green-700 5.02:1, orange-700 5.18:1 on white — while fills,
 * spines, dots, tints and edges keep the -600/-500 family (non-text floor is
 * 3:1, which they clear).
 *
 * Which state gets which tone is LIFECYCLE's job (lifecycle.ts): packed is
 * `fulfillment`, shipped is `success`, never the fulfillment purple.
 */
export type StateName = 'info' | 'warning' | 'fulfillment' | 'danger' | 'success';

export interface StateTone {
  /** Ink as text on a light plane. */
  text: string;
  /** Solid fill — progress bars, spines, dots. */
  fill: string;
  /** Pastel surface behind the tone's text. */
  tint: string;
  /** Border of a tinted chip / pill. */
  edge: string;
}

const { blue, orange, purple, red, green } = baseColors;

export const STATE_TONES = {
  info: { text: blue[600], fill: blue[600], tint: blue[50], edge: blue[400] },
  warning: { text: orange[700], fill: orange[500], tint: orange[50], edge: orange[400] },
  fulfillment: { text: purple[600], fill: purple[500], tint: purple[50], edge: purple[400] },
  danger: { text: red[600], fill: red[500], tint: red[50], edge: red[400] },
  success: { text: green[700], fill: green[600], tint: green[50], edge: green[400] },
} as const satisfies Record<StateName, StateTone>;

export const STATE_NAMES = Object.keys(STATE_TONES) as StateName[];
