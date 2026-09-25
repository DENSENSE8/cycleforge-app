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
 * The `code` role is the SOLID BADGE behind a lifecycle state code on an
 * industrial row (owner 2026-09-25): a fill dark enough that its `codeInk`
 * clears 4.5:1 — white on the -700 step; warning keeps its own orange fill
 * (the urgent spine's colour) with near-black ink, because white on orange
 * fails. Measured: info 6.70 · warning 6.75 · fulfillment 6.98 · danger 6.47 ·
 * success 5.02.
 *
 * Which state gets which tone is LIFECYCLE's job (lifecycle.ts): packed is
 * `fulfillment`, shipped is `success`, never the fulfillment purple.
 */
export type StateName = 'info' | 'warning' | 'fulfillment' | 'danger' | 'success';

/**
 * One named operational state as painted by an industrial record. Registries
 * such as outbound lifecycle and inbound delivery supply the vocabulary; the
 * record primitive only consumes this shape.
 */
export interface OperationalStateSpec {
  code: string;
  label: string;
  tone: StateName;
  icon: string;
  /** A hatched state spine carries an exceptional blocked/empty condition. */
  hatched?: boolean;
}

export interface StateTone {
  /** Ink as text on a light plane. */
  text: string;
  /** Solid fill — progress bars, spines, dots. */
  fill: string;
  /** Pastel surface behind the tone's text. */
  tint: string;
  /** Border of a tinted chip / pill. */
  edge: string;
  /** Solid badge behind a lifecycle state code. */
  code: string;
  /** Ink of the code on its badge (≥ 4.5:1 on `code`). */
  codeInk: string;
}

const { blue, orange, purple, red, green, gray, white } = baseColors;

export const STATE_TONES = {
  info: { text: blue[600], fill: blue[600], tint: blue[50], edge: blue[400], code: blue[700], codeInk: white },
  warning: { text: orange[700], fill: orange[500], tint: orange[50], edge: orange[400], code: orange[500], codeInk: gray[900] },
  fulfillment: { text: purple[600], fill: purple[500], tint: purple[50], edge: purple[400], code: purple[700], codeInk: white },
  danger: { text: red[600], fill: red[500], tint: red[50], edge: red[400], code: red[700], codeInk: white },
  success: { text: green[700], fill: green[600], tint: green[50], edge: green[400], code: green[700], codeInk: white },
} as const satisfies Record<StateName, StateTone>;

export const STATE_NAMES = Object.keys(STATE_TONES) as StateName[];

/**
 * Lifecycle code CSS. `.state-code-<tone>` is the tone's ink as bare text
 * (warning reads the mode's readable warn ink); `.state-badge-<tone>` is the
 * solid code badge — `code` fill, `codeInk` text — worn by the desk state code.
 */
export function stateCodeCssText(): string {
  const ink: Record<StateName, string> = {
    info: 'var(--ds-color-text-info)',
    warning: 'var(--mode-warn-text)',
    fulfillment: 'var(--ds-color-text-fulfillment)',
    danger: 'var(--ds-color-text-danger)',
    success: 'var(--ds-color-text-success)',
  };
  return STATE_NAMES.flatMap((tone) => [
    `.state-code-${tone} {`,
    `  color: ${ink[tone]};`,
    `}`,
    `.state-badge-${tone} {`,
    `  color: ${STATE_TONES[tone].codeInk};`,
    `  background-color: ${STATE_TONES[tone].code};`,
    `}`,
  ]).join('\n');
}
