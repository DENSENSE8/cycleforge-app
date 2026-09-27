import { baseColors } from './primitives';

/**
 * State / functional colours — mode-independent and platform-independent.
 * (3.56:1) fail the 4.5:1 text floor on white (BRIEF §8), so their TEXT ink is
 * industrial row (owner 2026-09-25): a fill dark enough that its `codeInk`
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
 * The badge corner is the region's CONTROL radius, not the pill: the code is a
 * boxed chip (modes.ts `radiusControl` — "filter chips that are not pills"),
 * rounded in triage and square on the industrial Floor / phones.
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
    `  border-radius: var(--mode-radius-control);`,
    `}`,
  ]).join('\n');
}
