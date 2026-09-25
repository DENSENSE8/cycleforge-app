import type { ModeName, ModeSurfaces } from './modes';

export interface TrialSpec {
  modes?: Partial<Record<ModeName, Partial<ModeSurfaces>>>;
  components?: {
    sectionRule?: string;
  };
}

/**
 * Open trials are deliberately small: each entry contains only the values that
 * change for that experiment. `?trial=` applies these values in the browser;
 * they are never persisted and never change the production baseline.
 */
export const TRIALS = {
  sectionRules: {
    components: { sectionRule: '#b7b8b0' },
  },
} as const satisfies Record<string, TrialSpec>;

export type TrialName = keyof typeof TRIALS;
export const TRIAL_NAMES = Object.keys(TRIALS) as TrialName[];

function trialSelector(name: string): string {
  return `html[data-trial~='${name}']`;
}

function modeCss(name: string, spec: TrialSpec): string[] {
  return Object.entries(spec.modes ?? {}).flatMap(([mode, values]) => {
    const lines = Object.entries(values ?? {}).map(([key, value]) => `  --mode-${key}: ${value};`);
    return lines.length > 0
      ? [`${trialSelector(name)} [data-mode='${mode}'] {`, ...lines, '}']
      : [];
  });
}

function componentCss(name: string, spec: TrialSpec): string[] {
  const selector = trialSelector(name);
  const components = spec.components ?? {};
  const blocks: string[] = [];
  if (components.sectionRule) {
    blocks.push(`${selector} .cf-section-rule {`, `  border-inline-start-color: ${components.sectionRule} !important;`, `}`);
  }
  return blocks;
}

export function trialCssText(): string {
  const blocks: string[] = [];
  for (const [name, spec] of Object.entries(TRIALS)) {
    blocks.push(...modeCss(name, spec), ...componentCss(name, spec));
  }
  return blocks.join('\n\n');
}
