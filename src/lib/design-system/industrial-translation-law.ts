/**
 * INDUSTRIAL TRANSLATION MATRIX — pasted Terminal Operations brief → CycleForge.
 *
 * This is the policy boundary between an external visual brief and the house
 * design system. Consumers choose an intent from this matrix; they never copy
 * the brief's Tailwind palette classes, physics objects, or sample components.
 *
 * The matrix is deliberately data-only and deterministic. The tripwire, CLI,
 * Design MCP face and eval cohort all evaluate this exact export.
 */

export type IndustrialRegion = 'mobile' | 'desk' | 'station' | 'monitor';
export type IndustrialDisposition = 'alias' | 'adopt' | 'reject' | 'scoped-exception';

export type IndustrialTranslationRow = {
  id: string;
  sourceConcepts: readonly string[];
  disposition: IndustrialDisposition;
  semanticToken: string;
  component: string;
  motionRole: string;
  regions: readonly IndustrialRegion[];
  mobileBehavior: string;
  exception: string | null;
};

export const INDUSTRIAL_POLICY = {
  headerCase:
    'Table headers remain sentence case through typographyPresets.tableHeader. Uppercase is reserved for section labels, field labels, status marks and hotkeys.',
  accent:
    'Product actions use the tenant accent or a semantic Button intent. Fixed blue is information semantics only, never the brand decision.',
  mono:
    'Technical values use the house font-mono stack (IBM Plex Mono). The pasted JetBrains Mono name is an intent reference, not a second bundled family.',
  darkChrome:
    'Terminal-dark chrome is legal only on station/monitor surfaces and named inverse bands. It is not a global desk or mobile substrate.',
  radius:
    'Use cornerClass roles and named exceptions. Industrial chrome resolves flush; existing named soft-shell exceptions remain valid.',
  motion:
    'Pick motionRole or an existing motion component. Never paste spring physics into a call site.',
} as const;

export const INDUSTRIAL_SOURCE_CONCEPTS = [
  // Palette vocabulary from the pasted YAML.
  'surface', 'surface-dim', 'surface-bright', 'surface-container-lowest',
  'surface-container-low', 'surface-container', 'surface-container-high',
  'surface-container-highest', 'on-surface', 'on-surface-variant', 'outline',
  'outline-variant', 'primary', 'primary-container', 'on-primary',
  'on-primary-container', 'secondary', 'secondary-container', 'on-secondary',
  'on-secondary-container', 'error', 'error-container', 'on-error',
  'on-error-container', 'warning', 'warning-container', 'on-warning',
  'on-warning-container', 'success', 'success-container', 'on-success',
  'on-success-container', 'terminal-black', 'terminal-slate', 'terminal-cyan',
  'terminal-emerald', 'terminal-amber', 'inverse-surface',
  'inverse-on-surface', 'surface-tint', 'inverse-primary', 'tertiary',
  'on-tertiary', 'tertiary-container', 'on-tertiary-container',
  'primary-fixed', 'primary-fixed-dim', 'on-primary-fixed',
  'on-primary-fixed-variant', 'secondary-fixed', 'secondary-fixed-dim',
  'on-secondary-fixed', 'on-secondary-fixed-variant', 'tertiary-fixed',
  'tertiary-fixed-dim', 'on-tertiary-fixed', 'on-tertiary-fixed-variant',
  'background', 'on-background', 'surface-variant',
  // Typography.
  'headline-lg', 'headline-md', 'headline-sm', 'body-lg', 'body-md', 'body-sm',
  'label-lg', 'label-md', 'label-sm', 'label-xs',
  // Spacing and geometry.
  'gutter', 'margin', 'space-xs', 'space-sm', 'space-md', 'space-lg', 'space-xl',
  'industrial-zero-padding', 'hairline-seams', 'zero-radius-rigidity',
  // Operational faces.
  'system-host-bar', 'telemetry-metric', 'column-header', 'technical-identifier',
  'bin-locator', 'timestamp', 'money-value', 'hotkey', 'status-blocker',
  'status-success', 'status-pending', 'status-warning', 'status-ai-review',
  'tactile-industrial-button', 'live-terminal-telemetry-led',
  'animated-manifest-table', 'persistent-batch-dock',
  // Motion and accessibility.
  'industrial-spring', 'instant-tap', 'terminal-stagger', 'row-scan-variants',
  'reduced-motion-fallback', 'keyboard-hotkeys',
] as const;

export const INDUSTRIAL_TRANSLATION_TRIPWIRE =
  'src/lib/design-system/industrial-translation-law.test.ts' as const;
export const INDUSTRIAL_TRANSLATION_LEDGER =
  'docs/eval/cohorts/industrial-translation/LEDGER.md' as const;
export const INDUSTRIAL_TRANSLATION_SNAPSHOTS =
  'docs/eval/cohorts/industrial-translation/snapshots' as const;

const ALL_REGIONS = ['mobile', 'desk', 'station', 'monitor'] as const;

export const INDUSTRIAL_TRANSLATION_MATRIX: readonly IndustrialTranslationRow[] = [
  {
    id: 'surface-base',
    sourceConcepts: ['surface', 'surface-bright', 'surface-container-lowest', 'background'],
    disposition: 'alias',
    semanticToken: 'bg-surface-card / bg-surface-canvas',
    component: 'AppSurface and existing page/sheet hosts',
    motionRole: 'none',
    regions: ALL_REGIONS,
    mobileBehavior: 'Phone and kiosk ground stay on the pinned mobile-ground contract.',
    exception: 'The pasted #f7f9ff does not replace the pinned light #fafafa plane.',
  },
  {
    id: 'surface-depth',
    sourceConcepts: ['surface-dim', 'surface-container-low', 'surface-container', 'surface-container-high', 'surface-container-highest', 'surface-variant'],
    disposition: 'alias',
    semanticToken: 'bg-surface-hover / bg-surface-sunken / bg-surface-strong',
    component: 'Panel, table-surface tokens and station wells',
    motionRole: 'none',
    regions: ALL_REGIONS,
    mobileBehavior: 'Use semantic surfaces; do not create nested grey cards on phone.',
    exception: null,
  },
  {
    id: 'surface-ink',
    sourceConcepts: ['on-surface', 'on-surface-variant', 'on-background'],
    disposition: 'alias',
    semanticToken: 'text-text-default / text-text-muted',
    component: 'Typography role selected by content intent',
    motionRole: 'none',
    regions: ALL_REGIONS,
    mobileBehavior: 'Identical semantic ink roles at phone density.',
    exception: null,
  },
  {
    id: 'surface-rules',
    sourceConcepts: ['outline', 'outline-variant', 'hairline-seams'],
    disposition: 'adopt',
    semanticToken: 'border-border-soft / border-border-default / border-border-hairline',
    component: 'LedgerGrid, DataTable, Panel and station shells',
    motionRole: 'none',
    regions: ALL_REGIONS,
    mobileBehavior: 'Hairlines may divide rows; never reduce touch target size.',
    exception: null,
  },
  {
    id: 'tenant-accent',
    sourceConcepts: ['primary', 'primary-container', 'on-primary', 'on-primary-container', 'surface-tint', 'inverse-primary', 'primary-fixed', 'primary-fixed-dim', 'on-primary-fixed', 'on-primary-fixed-variant'],
    disposition: 'alias',
    semanticToken: 'accent variables / Button primary and primarySoft',
    component: 'Button and named accent-aware controls',
    motionRole: 'motionRole.gesture.press when physical press feedback is warranted',
    regions: ALL_REGIONS,
    mobileBehavior: 'Same semantic action; full-width only when the mobile workflow calls for it.',
    exception: 'Fixed sky/blue values are allowed only for information semantics, not tenant brand.',
  },
  {
    id: 'inverse-chrome',
    sourceConcepts: ['secondary', 'secondary-container', 'on-secondary', 'on-secondary-container', 'inverse-surface', 'inverse-on-surface', 'secondary-fixed', 'secondary-fixed-dim', 'on-secondary-fixed', 'on-secondary-fixed-variant', 'terminal-black', 'terminal-slate'],
    disposition: 'scoped-exception',
    semanticToken: 'bg-surface-inverse / text-text-inverse / border-border-inverse',
    component: 'Named station, monitor or inverse action band',
    motionRole: 'none',
    regions: ['station', 'monitor'],
    mobileBehavior: 'No terminal-dark page theme; a named inverse control band may be shared.',
    exception: INDUSTRIAL_POLICY.darkChrome,
  },
  {
    id: 'danger-tone',
    sourceConcepts: ['error', 'error-container', 'on-error', 'on-error-container'],
    disposition: 'alias',
    semanticToken: 'text/surface/border/fill-danger',
    component: 'StatusBadge, Button danger or dangerSoft, ActionFlashRow where applicable',
    motionRole: 'motionRole.feedback.pulse',
    regions: ALL_REGIONS,
    mobileBehavior: 'Pair color with a word or icon; never color-only.',
    exception: null,
  },
  {
    id: 'warning-tone',
    sourceConcepts: ['warning', 'warning-container', 'on-warning', 'on-warning-container', 'terminal-amber'],
    disposition: 'alias',
    semanticToken: 'text/surface/border/fill-warning',
    component: 'StatusBadge or Button warning',
    motionRole: 'motionRole.feedback.pulse',
    regions: ALL_REGIONS,
    mobileBehavior: 'Retain explicit warning copy beside the tone.',
    exception: null,
  },
  {
    id: 'success-tone',
    sourceConcepts: ['success', 'success-container', 'on-success', 'on-success-container', 'terminal-emerald'],
    disposition: 'alias',
    semanticToken: 'text/surface/border/fill-success',
    component: 'StatusBadge, Button success, ActionFlashRow',
    motionRole: 'motionRole.feedback.pulse or liveChange according to causality',
    regions: ALL_REGIONS,
    mobileBehavior: 'Use restrained acknowledgement; do not persist decorative pulsing.',
    exception: null,
  },
  {
    id: 'information-tone',
    sourceConcepts: ['terminal-cyan'],
    disposition: 'alias',
    semanticToken: 'text-info / fill-info',
    component: 'StatusBadge or telemetry readout',
    motionRole: 'motionRole.feedback.liveChange',
    regions: ['station', 'monitor', 'desk'],
    mobileBehavior: 'Show only information required to complete the mobile verb.',
    exception: 'Cyan is not a second accent family.',
  },
  {
    id: 'tertiary-material-colors',
    sourceConcepts: ['tertiary', 'on-tertiary', 'tertiary-container', 'on-tertiary-container', 'tertiary-fixed', 'tertiary-fixed-dim', 'on-tertiary-fixed', 'on-tertiary-fixed-variant'],
    disposition: 'reject',
    semanticToken: 'none; select an existing functional tone or station-skin role',
    component: 'none',
    motionRole: 'none',
    regions: ALL_REGIONS,
    mobileBehavior: 'No tertiary palette API is exposed.',
    exception: 'A future distinct semantic job requires its own law before a token is added.',
  },
  {
    id: 'headline-type',
    sourceConcepts: ['headline-lg', 'headline-md', 'headline-sm'],
    disposition: 'alias',
    semanticToken: 'text-role-display / text-role-title / text-role-subtitle',
    component: 'Existing page and pane chrome',
    motionRole: 'none',
    regions: ALL_REGIONS,
    mobileBehavior: 'Use the smaller role selected by the mobile host; do not fluidly scale ops headings.',
    exception: null,
  },
  {
    id: 'body-type',
    sourceConcepts: ['body-lg', 'body-md', 'body-sm'],
    disposition: 'alias',
    semanticToken: 'text-role-body / text-role-data / text-role-caption',
    component: 'Typography presets and host density',
    motionRole: 'none',
    regions: ALL_REGIONS,
    mobileBehavior: 'Never drop below the existing caption floor for actionable copy.',
    exception: null,
  },
  {
    id: 'technical-label-type',
    sourceConcepts: ['label-lg', 'label-md', 'label-sm', 'label-xs'],
    disposition: 'alias',
    semanticToken: 'text-role-data / text-role-caption / text-role-micro + font-mono where the value is character-scanned',
    component: 'typographyPresets and CopyChip family',
    motionRole: 'none',
    regions: ALL_REGIONS,
    mobileBehavior: 'Technical labels wrap only when the host explicitly permits it.',
    exception: INDUSTRIAL_POLICY.mono,
  },
  {
    id: 'spacing-scale',
    sourceConcepts: ['gutter', 'margin', 'space-xs', 'space-sm', 'space-md', 'space-lg', 'space-xl', 'industrial-zero-padding'],
    disposition: 'alias',
    semanticToken: 'spacingScale and inset/stack intents',
    component: 'Host-owned layout primitives',
    motionRole: 'none',
    regions: ALL_REGIONS,
    mobileBehavior: 'Zero visual gutter never means a sub-44px touch target.',
    exception: 'The pasted 0px gutter is legal only for flush sheet/station seams.',
  },
  {
    id: 'corner-policy',
    sourceConcepts: ['zero-radius-rigidity'],
    disposition: 'adopt',
    semanticToken: "cornerClass('flush') and named radius exceptions",
    component: 'All house primitives',
    motionRole: 'none',
    regions: ALL_REGIONS,
    mobileBehavior: 'Mobile keeps named card/control exceptions where already governed.',
    exception: INDUSTRIAL_POLICY.radius,
  },
  {
    id: 'telemetry-typography',
    sourceConcepts: ['system-host-bar', 'telemetry-metric', 'technical-identifier', 'bin-locator', 'timestamp', 'money-value'],
    disposition: 'alias',
    semanticToken: 'typographyPresets.monoValue / chipText / qtyProgress + tabular-nums',
    component: 'CopyChip, LedgerValue and registered field renderers',
    motionRole: 'motionRole.feedback.liveChange for remote updates only',
    regions: ALL_REGIONS,
    mobileBehavior: 'Show the minimum operational identifier; preserve the exact value.',
    exception: 'Money color follows meaning, not an unconditional green.',
  },
  {
    id: 'header-typography',
    sourceConcepts: ['column-header'],
    disposition: 'reject',
    semanticToken: 'typographyPresets.tableHeader',
    component: 'LedgerGridColumnHeader',
    motionRole: 'none',
    regions: ['desk', 'station', 'monitor'],
    mobileBehavior: 'Mobile uses record labels, not a compressed desktop header row.',
    exception: INDUSTRIAL_POLICY.headerCase,
  },
  {
    id: 'hotkey-face',
    sourceConcepts: ['hotkey', 'keyboard-hotkeys'],
    disposition: 'alias',
    semanticToken: 'text-role-micro + house hotkey tokens',
    component: 'HotkeyGlyph and the shortcut-display cohort',
    motionRole: 'none',
    regions: ['desk', 'station'],
    mobileBehavior: 'Hide hardware key hints; preserve the visible touch verb.',
    exception: 'The staff ? law keeps glyphs inline on buttons; no cheat-sheet fork.',
  },
  {
    id: 'status-faces',
    sourceConcepts: ['status-blocker', 'status-success', 'status-pending', 'status-warning', 'status-ai-review'],
    disposition: 'alias',
    semanticToken: 'semantic status tone selected by domain state',
    component: 'StatusBadge and registered status field faces',
    motionRole: 'motionRole.feedback.liveChange for remote changes',
    regions: ALL_REGIONS,
    mobileBehavior: 'Text/icon meaning must survive without hover.',
    exception: 'Purple is fulfillment/domain meaning, not a generic AI decoration.',
  },
  {
    id: 'command-button',
    sourceConcepts: ['tactile-industrial-button'],
    disposition: 'alias',
    semanticToken: 'Button semantic variants + cornerClass flush',
    component: 'Button',
    motionRole: 'motionRole.gesture.press',
    regions: ALL_REGIONS,
    mobileBehavior: 'Use the same verb and intent with a touch-sized face.',
    exception: 'Never add a second motion.button primitive.',
  },
  {
    id: 'live-telemetry',
    sourceConcepts: ['live-terminal-telemetry-led'],
    disposition: 'alias',
    semanticToken: 'semantic status tone + text-role-micro',
    component: 'Existing status/connection indicator; add a named component only with a distinct job',
    motionRole: 'motionRole.feedback.liveChange',
    regions: ['station', 'monitor'],
    mobileBehavior: 'Render a static status word/icon under reduced motion and on constrained phone views.',
    exception: 'No infinite decorative pulse for a stable healthy state.',
  },
  {
    id: 'manifest-table',
    sourceConcepts: ['animated-manifest-table'],
    disposition: 'alias',
    semanticToken: 'table-surface, typography and status tokens',
    component: 'DataTable + slot-table engine; domain supplies registered rows',
    motionRole: 'DenseList / motionRole.swap.scan as selected by the host',
    regions: ['desk', 'station'],
    mobileBehavior: 'The same verb is exposed through the corresponding /m record workflow, never a squeezed grid.',
    exception: 'Never create a second manifest/table shell.',
  },
  {
    id: 'batch-dock',
    sourceConcepts: ['persistent-batch-dock'],
    disposition: 'alias',
    semanticToken: 'inverse band + action-bar height law',
    component: 'Existing selection/action strip and Button execute',
    motionRole: 'motionRole.push.rail only when the dock reflows siblings',
    regions: ['desk', 'station'],
    mobileBehavior: 'Expose batch completion on /m first or with an explicit mobile-first ledger entry.',
    exception: 'The band owns its height; children and pressed states cannot change it.',
  },
  {
    id: 'spring-physics',
    sourceConcepts: ['industrial-spring', 'instant-tap', 'terminal-stagger', 'row-scan-variants'],
    disposition: 'reject',
    semanticToken: 'none at call sites',
    component: 'useMotionRole, DenseList, DenseRowReveal or ActionFlashRow',
    motionRole: 'motionRole.swap.scan / swap.focus / gesture.press / feedback.* selected by job',
    regions: ALL_REGIONS,
    mobileBehavior: 'The role bridge supplies the reduced form.',
    exception: INDUSTRIAL_POLICY.motion,
  },
  {
    id: 'reduced-motion',
    sourceConcepts: ['reduced-motion-fallback'],
    disposition: 'adopt',
    semanticToken: 'ReducedMotionProvider contract',
    component: 'useMotionRole and existing motion bridges',
    motionRole: 'role-defined reduced behavior',
    regions: ALL_REGIONS,
    mobileBehavior: 'Identical preference handling on phone, desk and station.',
    exception: 'Do not implement a page-local prefers-reduced-motion branch.',
  },
] as const;

export type IndustrialTranslationVerdict = {
  schemaVersion: 1;
  ok: boolean;
  law: string;
  policies: typeof INDUSTRIAL_POLICY;
  sourceConceptCount: number;
  mappedConceptCount: number;
  rows: number;
  violations: Array<{ id: string; why: string }>;
};

export function evaluateIndustrialTranslationMatrix(): IndustrialTranslationVerdict {
  const violations: Array<{ id: string; why: string }> = [];
  const expected = new Set<string>(INDUSTRIAL_SOURCE_CONCEPTS);
  const seen = new Map<string, string>();

  for (const row of INDUSTRIAL_TRANSLATION_MATRIX) {
    if (!row.id || !row.semanticToken || !row.component || !row.motionRole || !row.mobileBehavior) {
      violations.push({ id: `incomplete-row:${row.id || 'unnamed'}`, why: 'Every row must select token, component, motion and mobile behavior.' });
    }
    if (row.regions.length === 0) {
      violations.push({ id: `regionless-row:${row.id}`, why: 'Every row must name at least one supported region.' });
    }
    for (const concept of row.sourceConcepts) {
      if (!expected.has(concept)) {
        violations.push({ id: `unknown-concept:${concept}`, why: `${row.id} maps a concept absent from the ratified source inventory.` });
      }
      const owner = seen.get(concept);
      if (owner) {
        violations.push({ id: `duplicate-concept:${concept}`, why: `${concept} is mapped by both ${owner} and ${row.id}.` });
      } else {
        seen.set(concept, row.id);
      }
    }
  }
  for (const concept of expected) {
    if (!seen.has(concept)) {
      violations.push({ id: `unmapped-concept:${concept}`, why: `${concept} has no translation row.` });
    }
  }

  return {
    schemaVersion: 1,
    ok: violations.length === 0,
    law: 'External visual concepts enter CycleForge only through semantic tokens, owned components and motion roles; the matrix must cover each source concept exactly once.',
    policies: INDUSTRIAL_POLICY,
    sourceConceptCount: expected.size,
    mappedConceptCount: seen.size,
    rows: INDUSTRIAL_TRANSLATION_MATRIX.length,
    violations,
  };
}
