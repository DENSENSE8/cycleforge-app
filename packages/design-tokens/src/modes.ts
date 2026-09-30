/** Mode registry — the single source of truth for the four TASK modes, on every platform (web, bundled desktop via generated/tokens.css,… */

// ── Contract ────────────────────────────────────────────────────────────────

export type ModeName = 'industrial' | 'triage' | 'counter' | 'assistant';

/** Light-scheme palette of a mode. Plain CSS colours. */
export interface ModeSurfaces {
  /** Page plane. */
  canvas: string;
  /** Bar / header band. */
  bar: string;
  /** Panel / row plane. */
  panel: string;
  /** Sunken well. */
  well: string;
  /** Row / interaction wash. */
  hover: string;
  /** Primary ink. */
  ink: string;
  /** Secondary text. */
  muted: string;
  /** Faint text — the lightest text a mode allows. */
  faint: string;
  /** Inner dividers. */
  rule: string;
  /** Edge / hairline around a surface. */
  edge: string;
  /** Border of an input / control. */
  control: string;
  /** Horizontal separator between records and between sections. */
  divide: string;
  /** Vertical divider inside a row — a column seam. `transparent` = none. */
  seam: string;
  /** Outline around a box (column, photo slot, recess). `transparent` = the box reads by space or shadow. */
  frame: string;
  /** Separator between facts INSIDE a record card (Bin · Picked by · Order #). `transparent` = spacing alone. */
  fact: string;
  /** Outline on the open / checked record. `transparent` = the record is marked by its fill alone. */
  mark: string;
}

/** A value that changes under `@media (pointer: coarse)`. */
export interface ModeMeasure {
  base: string;
  coarse: string;
}

/** A padding pair: inline (x) and block (y). */
export interface ModeInset {
  x: string;
  y: string;
}

/**
 * The spacing INTENTS, per mode — one value per recurring padding / gap job,
 * consumed by the `inset-*` / `stack-*` / `row-*` utilities (tailwind.config.mjs).
 * px here (the unit every mode measure speaks, and what the Swift face reads);
 * the web emits rem, so the Appearance font scale still grows them, and the
 * utilities multiply by `--cf-density`.
 */
export interface ModeSpacing {
  inset: {
    /** Chip / badge / count pill. */
    chip: ModeInset;
    /** Form field, command input, a padded control face. */
    field: ModeInset;
    /** Menu row, list row, compact control. */
    cozy: ModeInset;
    /** Card / panel body (uniform). */
    card: ModeInset;
    /** Empty / zero state. */
    empty: ModeInset;
  };
  /** Vertical gap between stacked items. */
  stack: {
    /** Facts inside a record. */
    tight: string;
    /** Rows / fields in a form or list. */
    row: string;
    /** Sections / panels. */
    section: string;
  };
  /** Horizontal gap between items on one line. */
  row: {
    gap: string;
    tight: string;
  };
}

export interface ModeSpec {
  name: ModeName;
  label: string;
  /** The job this mode serves — one line. */
  hint: string;
  surfaces: ModeSurfaces;
  /** Card / panel / dialog corner. */
  radius: string;
  /** Control corner — fields, buttons, menu rows, filter chips that are not pills. */
  radiusControl: string;
  radiusPill: string;
  pagePad: ModeMeasure;
  /** Minimum hit target. */
  hit: ModeMeasure;
  /** Primary-action hit target (defaults to `hit`). */
  hitCta?: ModeMeasure;
  bodyText: ModeMeasure;
  /** Padding / gap per intent. */
  spacing: ModeSpacing;
  /**
   * How a fact LABEL speaks (`Bin`, `Ship by`): `mono` — mono heavy, the floor
   * voice; `sentence` — sans, the desk voice. BOTH are sentence case: no voice
   * uppercases text (owner 2026-09-26: sentence case reads faster; 2026-09-28:
   * every display, the floor included).
   */
  labelVoice: 'mono' | 'sentence';
  motion: {
    /** State-change feedback (step, enter, scan-status spot). */
    feedback: string;
    /** Press response (defaults to `feedback`). */
    press?: string;
    /** Indeterminate pulse (defaults to none). */
    pulse?: string;
  };
  /** Warning ink as TEXT (defaults to the theme's `text-warning`). */
  warnText?: string;
  /** Tenant brand colour; overridden per org at the region root. */
  brand?: string;
  /** Matte grain, as a DEPTH ladder: */
  grain?: ModeGrain;
}

/** One grain layer: noise opacity over the surface, and speck frequency (lower = coarser). */
export interface GrainLayer {
  opacity: number;
  frequency: number;
}

/** Grain per depth, deepest first. */
export interface ModeGrain {
  /** Recessed wells — photo slot, empty slots, troughs. Coarsest. No amber text on a well. */
  well: GrainLayer;
  /** The ground behind the stage. */
  canvas: GrainLayer;
  /** Chrome — tab strip, toolbar, evidence column, group bands. Finest. */
  bar: GrainLayer;
  /** Pressed / active ink fills (active tab, pressed segment). */
  inverse: GrainLayer;
}

// ── Registry ────────────────────────────────────────────────────────────────

/** The slate palette the identity-exempt modes (counter / assistant) sit on. */
export const SLATE_SURFACES: ModeSurfaces = {
  canvas: '#fafafa',
  bar: '#ffffff',
  panel: '#ffffff',
  well: '#f1f5f9',
  hover: '#f8fafc',
  ink: '#0f172a',
  muted: '#475569',
  faint: '#64748b',
  rule: '#e2e8f0',
  edge: '#cbd5e1',
  control: '#7b8aa0',
  divide: '#e2e8f0',
  seam: '#e2e8f0',
  frame: '#cbd5e1',
  fact: '#e2e8f0',
  mark: '#0f172a',
};

/**
 * The warm industrial palette — the phone floor (`/m/*`, scan stations, the
 * hardware mirror). No light-grey text on the floor: `faint` is `muted`.
 */
export const WARM_SURFACES: ModeSurfaces = {
  canvas: '#fafafa',
  bar: '#f8f8f4',
  panel: '#ffffff',
  well: '#e6e7e1',
  hover: '#f4f4ef',
  ink: '#10110f',
  muted: '#535650',
  faint: '#535650',
  rule: '#cacbc5',
  edge: '#b7b8b0',
  control: '#10110f',
  // The floor is drawn in lines: ink between records, edge seams, ink boxes.
  divide: '#10110f',
  seam: '#b7b8b0',
  frame: '#10110f',
  fact: '#b7b8b0',
  mark: '#10110f',
};

/**
 * shadcn/ui new-york "neutral" — the desktop triage palette (owner 2026-09-26,
 * BRIEF §12), laid out like a Shopify order list: rounded cards on a grey
 * canvas, horizontal hairlines only — no column seams, no box outlines (a
 * floating surface reads by its shadow). Departures from stock, for the §8
 * floor: `faint` #6b6b6b holds 4.5:1 on the canvas and the well; `control`
 * #8a8a8a holds 3:1 for an input border.
 */
export const NEUTRAL_SURFACES: ModeSurfaces = {
  canvas: '#ffffff',
  bar: '#ffffff',
  panel: '#ffffff',
  well: '#f5f5f5',
  hover: '#f7f7f7',
  ink: '#0a0a0a',
  muted: '#525252',
  faint: '#6b6b6b',
  rule: '#ebebeb',
  edge: '#d4d4d4',
  control: '#8a8a8a',
  divide: '#ebebeb',
  seam: 'transparent',
  frame: 'transparent',
  fact: 'transparent',
  mark: 'transparent',
};

/**
 * The warn INK on every plane — deep orange (orange-800, 7.3:1 on white) so a
 * warning reads as a warning, never as brown body text (owner 2026-09-29:
 * "No tracking attached yet" must be readable at a glance). #d39200 fails
 * contrast as text; the old #8a5f00 read as brown.
 */
const WARN_INK = '#9a3412';

/**
 * The pre-mode spacing scale — the values the intent utilities rendered
 * before they became mode-aware; industrial, counter and assistant run it.
 * A mode diverges by declaring its own {@link ModeSpacing} (triage:
 * {@link TRIAGE_SPACING}), never by a component overriding an intent.
 */
export const DESK_SPACING: ModeSpacing = {
  inset: {
    chip: { x: '6px', y: '2px' },
    field: { x: '12px', y: '8px' },
    cozy: { x: '10px', y: '6px' },
    card: { x: '16px', y: '16px' },
    empty: { x: '16px', y: '24px' },
  },
  stack: { tight: '6px', row: '8px', section: '24px' },
  row: { gap: '8px', tight: '6px' },
};

/**
 * Triage spacing — a native desktop app's rhythm (owner 2026-09-27): every
 * value on Fluent 2's 4px ramp (2 · 4 · 8 · 12 · 16 · 20 · 24 · 32, with 6 as
 * the icon nudge — fluent2.microsoft.design/layout). One step roomier than
 * {@link DESK_SPACING} where the eye reads (rows, facts, sections); controls
 * whose height is fixed by the hit target keep their inset.
 *
 * vs DESK: chip 6→8 x · cozy 10×6→12×8 (a 14px row lands on the 32px hit) ·
 * card 16→20 x · empty 24→32 y · stack 6/8/24→8/12/32. Unchanged: field,
 * row gap 8, row tight 6.
 */
export const TRIAGE_SPACING: ModeSpacing = {
  inset: {
    chip: { x: '8px', y: '2px' },
    field: { x: '12px', y: '8px' },
    cozy: { x: '12px', y: '8px' },
    card: { x: '20px', y: '16px' },
    empty: { x: '24px', y: '32px' },
  },
  stack: { tight: '8px', row: '12px', section: '32px' },
  row: { gap: '8px', tight: '6px' },
};

/** Industrial on phones, triage on desktop (owner 2026-09-26, BRIEF §12). */
export const MODE_REGISTRY = {
  industrial: {
    name: 'industrial',
    label: 'Industrial',
    hint: 'Phones and scan stations — dense: flush rows, square, 13px, no page padding, 0 ms.',
    surfaces: WARM_SURFACES,
    radius: '0',
    radiusControl: '0',
    radiusPill: '0',
    warnText: WARN_INK,
    // Owner 2026-09-25: a hardware finish that reads as DEPTH — rougher is deeper.
    grain: {
      well: { opacity: 0.03, frequency: 0.45 },
      canvas: { opacity: 0.07, frequency: 0.65 },
      bar: { opacity: 0.07, frequency: 0.85 },
      inverse: { opacity: 0.12, frequency: 0.85 },
    },
    pagePad: { base: '0', coarse: '0' },
    hit: { base: '32px', coarse: '48px' },
    bodyText: { base: '13px', coarse: '13px' },
    spacing: DESK_SPACING,
    labelVoice: 'mono',
    // 150ms is the scan-status spot only; nothing else on the floor moves.
    motion: { feedback: '150ms' },
  },
  triage: {
    name: 'triage',
    label: 'Triage',
    hint: 'Every desktop route — decide-and-route work: shadcn neutral, 10px cards, 8px controls, pill chips.',
    surfaces: NEUTRAL_SURFACES,
    // shadcn new-york `--radius: 0.625rem`: card = radius, control = radius − 2px.
    radius: '10px',
    radiusControl: '8px',
    radiusPill: '9999px',
    warnText: WARN_INK,
    pagePad: { base: '12px', coarse: '16px' },
    hit: { base: '32px', coarse: '48px' },
    bodyText: { base: '14px', coarse: '16px' },
    spacing: TRIAGE_SPACING,
    labelVoice: 'sentence',
    motion: { feedback: '160ms', press: '120ms' },
  },
  counter: {
    name: 'counter',
    label: 'Counter',
    hint: 'Customer-facing counter tablet — soft corners, 16px, big targets.',
    surfaces: SLATE_SURFACES,
    radius: '12px',
    radiusControl: '12px',
    radiusPill: '9999px',
    pagePad: { base: '16px', coarse: '24px' },
    hit: { base: '40px', coarse: '48px' },
    hitCta: { base: '56px', coarse: '56px' },
    bodyText: { base: '16px', coarse: '16px' },
    spacing: DESK_SPACING,
    labelVoice: 'sentence',
    motion: { feedback: '200ms', press: '100ms' },
    // Default tenant ink (USAV navy, sampled from public/images/usav-logo.png).
    // The org's `settings.brand.primaryColor` overrides it at the region root.
    brand: '#1f316d',
  },
  assistant: {
    name: 'assistant',
    label: 'Assistant',
    hint: 'Conversational AI surfaces — the assistant dock and /ai-chat.',
    surfaces: SLATE_SURFACES,
    radius: '12px',
    radiusControl: '12px',
    radiusPill: '9999px',
    pagePad: { base: '16px', coarse: '16px' },
    hit: { base: '32px', coarse: '48px' },
    bodyText: { base: '15px', coarse: '16px' },
    spacing: DESK_SPACING,
    labelVoice: 'sentence',
    motion: { feedback: '200ms', pulse: '1200ms' },
  },
} satisfies Record<ModeName, ModeSpec>;

export const MODE_NAMES = Object.keys(MODE_REGISTRY) as ModeName[];

// ── Looks ───────────────────────────────────────────────────────────────────

/**
 * A LOOK is one job's refinement of the modes — never a fifth mode. The
 * region still requests a mode (`mode`) and still resolves by device
 * (`data-mode`: triage on a desk, industrial on a phone / touch screen), and
 * the look re-declares, PER RESOLVED MODE, only the planes, corners, padding
 * and body size that job needs. Hit targets and label voice stay the mode's.
 * A mode the look does not refine paints as that mode, untouched.
 */
export type ModeLookName = 'labels-documents';

/** What a look changes inside one resolved mode. */
export interface ModeLookRefinement {
  surfaces?: Partial<ModeSurfaces>;
  radius?: string;
  radiusControl?: string;
  radiusPill?: string;
  pagePad?: ModeMeasure;
  bodyText?: ModeMeasure;
  spacing?: ModeSpacing;
}

export interface ModeLookSpec {
  name: ModeLookName;
  /** The mode the region requests; it resolves by device like any region. */
  mode: ModeName;
  label: string;
  /** The job this look serves — one line. */
  hint: string;
  refines: Partial<Record<ModeName, ModeLookRefinement>>;
}

/**
 * Labels & documents spacing — micro padding for a print triage desk (owner
 * 2026-09-27): rows sized for scanning 100+ labels in one column, the hit
 * target (32px desk / 48px touch) left to the mode.
 */
const LABELS_DOCUMENTS_SPACING: ModeSpacing = {
  inset: {
    chip: { x: '6px', y: '1px' },
    field: { x: '8px', y: '4px' },
    cozy: { x: '8px', y: '4px' },
    card: { x: '12px', y: '8px' },
    empty: { x: '16px', y: '16px' },
  },
  stack: { tight: '4px', row: '6px', section: '16px' },
  row: { gap: '6px', tight: '4px' },
};

export const MODE_LOOKS = {
  'labels-documents': {
    name: 'labels-documents',
    mode: 'triage',
    label: 'Labels & documents',
    hint: 'Label printing and document intake — a triage-only desk: white cards on a high-contrast off-white canvas, micro padding. Never Floor.',
    refines: {
      // Desk: triage's floating cards (10px corner, 8px controls, 12px page
      // gutter) on an off-white canvas, so a white 4×6 label reads as paper;
      // rows inside a card are divided by drawn seams. `faint` #5c5c58 holds
      // 6.5:1 on the canvas.
      triage: {
        surfaces: {
          canvas: '#f3f3ef',
          bar: '#ffffff',
          panel: '#ffffff',
          well: '#f1f1ec',
          hover: '#efefea',
          ink: '#0a0a0a',
          muted: '#3d3d3a',
          faint: '#5c5c58',
          rule: '#e1e1db',
          edge: '#d6d6cf',
          control: '#7a7a74',
          divide: '#e1e1db',
          seam: '#e1e1db',
          frame: '#c7c7c0',
          mark: '#0a0a0a',
        },
        bodyText: { base: '13px', coarse: '14px' },
        spacing: LABELS_DOCUMENTS_SPACING,
      },
      // Triage only (owner 2026-09-27): one job — show labels, print them —
      // so no industrial refinement; the region never resolves industrial.
    },
  },
} satisfies Record<ModeLookName, ModeLookSpec>;

export const MODE_LOOK_NAMES = Object.keys(MODE_LOOKS) as ModeLookName[];

/** Every (look, resolved mode) pair a look refines. */
function lookRefinements(name: ModeLookName): [ModeName, ModeLookRefinement][] {
  const look: ModeLookSpec = MODE_LOOKS[name];
  return (Object.entries(look.refines) as [ModeName, ModeLookRefinement][]).filter(([, refinement]) => refinement != null);
}

/** The full spec a look paints inside `mode`: that mode's spec with the look's refinement laid over it. */
function resolveModeLook(name: ModeLookName, mode: ModeName): ModeSpec {
  const base = MODE_REGISTRY[mode];
  const look = (MODE_LOOKS[name] as ModeLookSpec).refines[mode] ?? {};
  return {
    ...base,
    surfaces: { ...base.surfaces, ...look.surfaces },
    radius: look.radius ?? base.radius,
    radiusControl: look.radiusControl ?? base.radiusControl,
    radiusPill: look.radiusPill ?? base.radiusPill,
    pagePad: look.pagePad ?? base.pagePad,
    bodyText: look.bodyText ?? base.bodyText,
    spacing: look.spacing ?? base.spacing,
  };
}

/**
 * Neutral theme var (`--ds-color-<key>`) → the mode surface that replaces it
 * inside a light-scheme region. NEUTRALS ONLY: functional/state tones are
 * never remapped by a mode.
 */
export const MODE_NEUTRAL_REMAP = {
  'background-canvas': 'canvas',
  'background-surface': 'panel',
  'surface-sunken': 'well',
  'surface-hover': 'hover',
  'text-primary': 'ink',
  'text-secondary': 'muted',
  'text-soft': 'faint',
  'text-faint': 'faint',
  'border-hairline': 'rule',
  'border-subtle': 'rule',
  'border-default': 'edge',
} as const satisfies Record<string, keyof ModeSurfaces>;

// ── CSS generation ──────────────────────────────────────────────────────────

/**
 * Colour vars resolve through the theme so a dark theme keeps its own planes.
 * `bar` / `control` / `warn` and the three line roles have no neutral twin;
 * their dark fallbacks are the nearest theme role, and the light block below
 * pins the mode literal.
 */
const MODE_COLOR_VAR_FALLBACK: Record<keyof ModeSurfaces, string> = {
  canvas: 'var(--ds-color-background-canvas)',
  bar: 'var(--ds-color-background-surface)',
  panel: 'var(--ds-color-background-surface)',
  well: 'var(--ds-color-surface-sunken)',
  hover: 'var(--ds-color-surface-hover)',
  ink: 'var(--ds-color-text-primary)',
  muted: 'var(--ds-color-text-secondary)',
  faint: 'var(--ds-color-text-soft)',
  rule: 'var(--ds-color-border-subtle)',
  edge: 'var(--ds-color-border-default)',
  control: 'var(--ds-color-border-emphasis)',
  divide: 'var(--ds-color-border-subtle)',
  seam: 'var(--ds-color-border-subtle)',
  frame: 'var(--ds-color-border-default)',
  fact: 'var(--ds-color-border-subtle)',
  mark: 'var(--ds-color-text-primary)',
};

/** Line roles — pinned on light; `transparent` is structure (no line), so it holds on dark too. */
const LINE_KEYS = ['divide', 'seam', 'frame', 'fact', 'mark'] as const satisfies readonly (keyof ModeSurfaces)[];

function isLineKey(key: keyof ModeSurfaces): key is (typeof LINE_KEYS)[number] {
  return (LINE_KEYS as readonly string[]).includes(key);
}

const SURFACE_KEYS = Object.keys(MODE_COLOR_VAR_FALLBACK) as (keyof ModeSurfaces)[];

function modeSelector(name: ModeName): string {
  return `[data-mode='${name}']`;
}

/** A look inside one resolved mode: `[data-mode='industrial'][data-look='…']`. */
function lookSelector(name: ModeLookName, mode: ModeName): string {
  return `${modeSelector(mode)}[data-look='${name}']`;
}

/** The grain layers, deepest first — the order the stylesheet and guard walk. */
export const GRAIN_DEPTHS = ['well', 'canvas', 'bar', 'inverse'] as const satisfies readonly (keyof ModeGrain)[];

/** Surface utilities each grain depth rides on. */
const GRAIN_SURFACES: Readonly<Record<keyof ModeGrain, readonly string[]>> = {
  well: ['bg-mode-well', 'bg-surface-sunken'],
  canvas: ['bg-mode-canvas', 'bg-surface-canvas'],
  bar: ['bg-mode-bar'],
  inverse: ['bg-mode-ink'],
};

/** One 160px tile of greyscale fractal noise, as a base64 SVG data URI. */
export function grainImage({ opacity, frequency }: GrainLayer): string {
  const stretch = `type='linear' slope='3' intercept='-1'`;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>` +
    `<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='${frequency}' numOctaves='3' stitchTiles='stitch'/>` +
    `<feColorMatrix type='matrix' values='0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0.33 0.33 0.33 0 0 0 0 0 0 1'/>` +
    `<feComponentTransfer><feFuncR ${stretch}/><feFuncG ${stretch}/><feFuncB ${stretch}/></feComponentTransfer></filter>` +
    `<rect width='160' height='160' filter='url(#g)' opacity='${opacity}'/></svg>`;
  return `url("data:image/svg+xml;base64,${btoa(svg)}")`;
}

/** The label voice as CSS — consumed by the `mode-label` / `mode-label-case` utilities (tailwind.config.mjs). */
function labelVoiceDeclarations(voice: ModeSpec['labelVoice'], indent: string): string[] {
  const mono = voice === 'mono';
  return [
    `${indent}--mode-label-case: none;`,
    `${indent}--mode-label-tracking: 0;`,
    `${indent}--mode-label-font: ${mono ? 'var(--ds-font-mono)' : 'var(--ds-font-sans)'};`,
    `${indent}--mode-label-weight: ${mono ? '700' : '500'};`,
    `${indent}--mode-label-size: ${mono ? '0.6875rem' : '0.75rem'};`,
  ];
}

/** A px length as rem (16px root) — so the Appearance font scale moves it. */
function pxToRem(css: string): string {
  const m = /^(\d+(?:\.\d+)?)(px)?$/.exec(css);
  if (!m || (!m[2] && m[1] !== '0')) throw new Error(`mode spacing: '${css}' is not a px length`);
  return m[1] === '0' ? '0' : `${Number(m[1]) / 16}rem`;
}

/** Every spacing-intent var, flattened: `[--mode-inset-chip-x, '6px'], …`. */
export function modeSpacingVars(spacing: ModeSpacing): [string, string][] {
  const vars: [string, string][] = [];
  for (const [intent, pad] of Object.entries(spacing.inset)) {
    vars.push([`--mode-inset-${intent}-x`, pad.x], [`--mode-inset-${intent}-y`, pad.y]);
  }
  for (const [intent, gap] of Object.entries(spacing.stack)) vars.push([`--mode-stack-${intent}`, gap]);
  for (const [intent, gap] of Object.entries(spacing.row)) vars.push([`--mode-row-${intent}`, gap]);
  return vars;
}

/** Every `--mode-*` variable a region declares — also the unwrapped-route `:root` fallback. */
function modeVarDeclarations(spec: ModeSpec): string[] {
  const hitCta = spec.hitCta ?? spec.hit;
  const lines = SURFACE_KEYS.map((key) => {
    const value = isLineKey(key) && spec.surfaces[key] === 'transparent' ? 'transparent' : MODE_COLOR_VAR_FALLBACK[key];
    return `  --mode-${key}: ${value};`;
  });
  lines.push(
    `  --mode-warn-text: var(--ds-color-text-warning);`,
    `  --mode-radius: ${spec.radius};`,
    `  --mode-radius-control: ${spec.radiusControl};`,
    `  --mode-radius-pill: ${spec.radiusPill};`,
    `  --mode-page-pad: ${spec.pagePad.base};`,
    `  --mode-hit: ${spec.hit.base};`,
    `  --mode-hit-cta: ${hitCta.base};`,
    `  --mode-text-body: ${spec.bodyText.base};`,
    `  --mode-motion-feedback: ${spec.motion.feedback};`,
    `  --mode-motion-press: ${spec.motion.press ?? spec.motion.feedback};`,
    `  --mode-motion-pulse: ${spec.motion.pulse ?? '0s'};`,
  );
  for (const [name, value] of modeSpacingVars(spec.spacing)) lines.push(`  ${name}: ${pxToRem(value)};`);
  lines.push(...labelVoiceDeclarations(spec.labelVoice, '  '));
  if (spec.brand) lines.push(`  --mode-brand: ${spec.brand};`);
  // Every region resets the ladder, so a nested ungrained region (assistant
  // rail) never inherits its parent's grain; the light block sets the values.
  for (const depth of GRAIN_DEPTHS) lines.push(`  --mode-grain-${depth}: none;`);
  return lines;
}

function baseDeclarations(spec: ModeSpec): string[] {
  return [...modeVarDeclarations(spec), '  color: var(--mode-ink);'];
}

/**
 * Light-scheme `--mode-*` literals. A region reaches its planes by remapping
 * the theme neutrals ({@link lightDeclarations}); `:root` must not touch the
 * theme, so it pins every mode colour directly instead.
 */
function lightModeVarDeclarations(spec: ModeSpec): string[] {
  const lines = SURFACE_KEYS.map((key) => `  --mode-${key}: ${spec.surfaces[key]};`);
  if (spec.warnText) lines.push(`  --mode-warn-text: ${spec.warnText};`);
  if (spec.grain) {
    for (const depth of GRAIN_DEPTHS) lines.push(`  --mode-grain-${depth}: ${grainImage(spec.grain[depth])};`);
  }
  return lines;
}

function lightDeclarations(spec: ModeSpec): string[] {
  const lines = Object.entries(MODE_NEUTRAL_REMAP).map(
    ([themeKey, surface]) => `  --ds-color-${themeKey}: ${spec.surfaces[surface]};`,
  );
  // The theme-less roles pin their literal on light; the rest follow the remap.
  lines.push(`  --mode-bar: ${spec.surfaces.bar};`, `  --mode-control: ${spec.surfaces.control};`);
  for (const key of LINE_KEYS) lines.push(`  --mode-${key}: ${spec.surfaces[key]};`);
  if (spec.warnText) lines.push(`  --mode-warn-text: ${spec.warnText};`);
  // Light scheme only: black noise is invisible on dark planes, and the
  // contrast guard measures the light palette.
  if (spec.grain) {
    for (const depth of GRAIN_DEPTHS) lines.push(`  --mode-grain-${depth}: ${grainImage(spec.grain[depth])};`);
  }
  return lines;
}

function coarseDeclarations(spec: ModeSpec): string[] {
  const hitCta = spec.hitCta ?? spec.hit;
  return [
    `    --mode-page-pad: ${spec.pagePad.coarse};`,
    `    --mode-hit: ${spec.hit.coarse};`,
    `    --mode-hit-cta: ${hitCta.coarse};`,
    `    --mode-text-body: ${spec.bodyText.coarse};`,
  ];
}

/** The generated mode stylesheet — injected once by the web's app/layout.tsx as `<style id="app-mode-registry">` and written into… */
export function modeRegistryCssText(): string {
  const blocks: string[] = [];
  for (const name of MODE_NAMES) {
    const spec = MODE_REGISTRY[name];
    blocks.push(`${modeSelector(name)} {\n${baseDeclarations(spec).join('\n')}\n}`);
    blocks.push(
      `html:not([data-color-scheme='dark']) ${modeSelector(name)} {\n${lightDeclarations(spec).join('\n')}\n}`,
    );
  }
  const coarse = MODE_NAMES.map(
    (name) => `  ${modeSelector(name)} {\n${coarseDeclarations(MODE_REGISTRY[name]).join('\n')}\n  }`,
  );
  blocks.push(`@media (pointer: coarse) {\n${coarse.join('\n')}\n}`);
  // Looks after their modes: `[data-mode][data-look]` outranks `[data-mode]`
  // at every scheme and pointer, so a look re-declares, never fights, its mode.
  for (const name of MODE_LOOK_NAMES) {
    for (const [mode] of lookRefinements(name)) {
      const spec = resolveModeLook(name, mode);
      const selector = lookSelector(name, mode);
      blocks.push(
        `${selector} {\n${baseDeclarations(spec).join('\n')}\n}`,
        `html:not([data-color-scheme='dark']) ${selector} {\n${lightDeclarations(spec).join('\n')}\n}`,
        `@media (pointer: coarse) {\n  ${selector} {\n${coarseDeclarations(spec).join('\n')}\n  }\n}`,
      );
    }
  }
  // Outside every region (sign-in, app shell chrome, any route no layout wraps)
  // the page renders as triage: every `--mode-*` var resolves, so no
  // `bg-mode-*` / `text-mode-*` / `border-mode-*` utility paints nothing.
  // Corners + label voice still follow the device: square mono labels on a touch
  // screen (owner 2026-09-26); hit / pad / body text follow the pointer.
  const desk = MODE_REGISTRY.triage;
  const floor = MODE_REGISTRY.industrial;
  blocks.push(
    `:root {\n${modeVarDeclarations(desk).join('\n')}\n}`,
    `html:not([data-color-scheme='dark']) {\n${lightModeVarDeclarations(desk).join('\n')}\n}`,
    `@media (pointer: coarse) {\n  :root {\n    --mode-radius: ${floor.radius};\n    --mode-radius-control: ${floor.radiusControl};\n    --mode-radius-pill: ${floor.radiusPill};\n${labelVoiceDeclarations(floor.labelVoice, '    ').join('\n')}\n${coarseDeclarations(desk).join('\n')}\n  }\n}`,
  );
  // `:where()` keeps these at zero specificity, so a component's own
  // background-image (hatched spine, gradient) always wins over the grain.
  blocks.push(
    ...GRAIN_DEPTHS.map(
      (depth) =>
        `:where(${GRAIN_SURFACES[depth].map((cls) => `.${cls}`).join(', ')}) {\n  background-image: var(--mode-grain-${depth}, none);\n}`,
    ),
  );
  blocks.push(
    `@media (prefers-reduced-motion: reduce) {\n  :root,\n  [data-mode] {\n    --mode-motion-feedback: 0ms;\n    --mode-motion-press: 0ms;\n    --mode-motion-pulse: 0s;\n  }\n}`,
  );
  return blocks.join('\n\n');
}
