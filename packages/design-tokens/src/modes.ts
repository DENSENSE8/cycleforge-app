/**
 * Mode registry — the single source of truth for the four TASK modes, on
 * every platform (web, bundled desktop via generated/tokens.css, iOS via
 * generated/DesignTokens.swift).
 *
 * A mode is what the operator is DOING in a region, not what they prefer to
 * look at (that is the theme axis, `themes/registry.ts`). It is stamped by a
 * region root as `data-mode="<name>"` — through `ModeRegion`
 * (`design-system/providers/ModeRegion.tsx`), never by hand — and nests by
 * REGION, one level deep: a page region plus at most one nested region (the
 * right rail). The scan bar and every state/functional colour
 * (success/warning/danger/info/fulfillment, `state.ts`) are mode-independent.
 *
 * This module owns the values and the CSS generator; the web re-exports it
 * from `src/design-system/modes/registry.ts`, whose `modeRegistryStyleText`
 * app/layout.tsx injects as `<style id="app-mode-registry">`, directly after
 * the theme palettes.
 *
 * What the stylesheet does, per mode:
 *   1. `[data-mode='<name>']` declares every `--mode-*` variable. Colour vars
 *      resolve THROUGH the neutral theme vars, so under a dark theme a mode's
 *      surfaces are that theme's surfaces (the mode palettes are light-only).
 *   2. `html:not([data-color-scheme='dark']) [data-mode='<name>']` remaps the
 *      NEUTRAL `--ds-color-*` vars (see {@link MODE_NEUTRAL_REMAP}) to the
 *      mode palette, so existing `bg-surface-*` / `text-text-*` /
 *      `border-border-*` utilities adopt the mode inside the region with no
 *      per-component change.
 *   3. `@media (pointer: coarse)` raises hit floors, padding and body text.
 *   4. `prefers-reduced-motion` collapses every mode duration to 0.
 *
 * Tailwind reads the vars as `rounded-mode`, `rounded-mode-pill`,
 * `p-mode-page`, `min-h-mode-hit`, `bg-mode-well`, `text-mode-warn`,
 * `duration-mode-feedback`, `text-mode-body` … (tailwind.config.mjs).
 */

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
}

/** A value that changes under `@media (pointer: coarse)`. */
export interface ModeMeasure {
  base: string;
  coarse: string;
}

export interface ModeSpec {
  name: ModeName;
  label: string;
  /** The job this mode serves — one line. */
  hint: string;
  surfaces: ModeSurfaces;
  radius: string;
  radiusPill: string;
  pagePad: ModeMeasure;
  /** Minimum hit target. */
  hit: ModeMeasure;
  /** Primary-action hit target (defaults to `hit`). */
  hitCta?: ModeMeasure;
  bodyText: ModeMeasure;
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
  /**
   * Matte grain, as a DEPTH ladder: rougher = deeper. Each layer is a noise
   * opacity plus a speck frequency (lower = coarser). Omit for none. The white
   * row panel and anything raised over it (popovers, dialogs) carry none: the
   * working surface is clean paper.
   */
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
};

/**
 * The warm industrial palette — the floor, the ledger, the desktop terminal.
 * No light-grey text on the floor: `faint` is `muted`.
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
};

/**
 * ── One language, two densities (owner ruling 2026-09-24) ──────────────────
 *
 * The OPERATIONAL family — `industrial` and `triage` — shares ONE identity:
 * warm greys, square corners, the same warning ink. A mode in this family may
 * change SPACE only ({@link DENSITY_KEYS}: padding, hit, body size, motion),
 * never identity. Triage used to carry slate greys and 4px corners, which put a
 * consumer-SaaS panel inside the industrial terminal on the same screen (the
 * Labels walk: warm ledger rail beside a slate, rounded record).
 *
 * Guard: `modes.guard.test.ts` fails CI if an operational mode overrides a key
 * outside {@link DENSITY_KEYS}, or if a new mode is added without either
 * joining this family or being exempted by name ({@link IDENTITY_EXEMPT_MODES}).
 */
export const OPERATIONAL_BASE = {
  surfaces: WARM_SURFACES,
  radius: '0',
  radiusPill: '0',
  // #d39200 fails contrast as text; this is its readable ink.
  warnText: '#8a5f00',
  // Owner 2026-09-25: a hardware finish that reads as DEPTH — rougher is
  // deeper. Opacity is capped by text contrast (7% is the ceiling on the warm
  // planes; a well has almost no headroom for amber), so depth is carried by
  // speck SIZE as much as strength: fine chrome, medium ground, coarse wells.
  // Worst-case contrast per layer: modes.guard.test.ts.
  grain: {
    well: { opacity: 0.03, frequency: 0.45 },
    canvas: { opacity: 0.07, frequency: 0.65 },
    bar: { opacity: 0.07, frequency: 0.85 },
    inverse: { opacity: 0.12, frequency: 0.85 },
  },
} as const satisfies Pick<ModeSpec, 'surfaces' | 'radius' | 'radiusPill' | 'warnText' | 'grain'>;

/** The keys a mode in the operational family may set for itself. */
export const DENSITY_KEYS = ['name', 'label', 'hint', 'pagePad', 'hit', 'hitCta', 'bodyText', 'motion'] as const;

/** Modes that share {@link OPERATIONAL_BASE}. */
export const OPERATIONAL_MODES = ['industrial', 'triage'] as const satisfies readonly ModeName[];

/**
 * Modes with their own identity, and why — each a separately ratified surface
 * (BRIEF §4c / §4d), never an operator desk.
 */
export const IDENTITY_EXEMPT_MODES = {
  counter: 'Customer-facing counter tablet (kiosk v2): tenant brand, 12px + pill, 56px CTA.',
  assistant: 'Conversational AI surfaces: transcript column, 12px + pill.',
} as const satisfies Partial<Record<ModeName, string>>;

export const MODE_REGISTRY = {
  industrial: {
    ...OPERATIONAL_BASE,
    name: 'industrial',
    label: 'Industrial',
    hint: 'Floor queues and scan stations — dense: flush rows, 13px, no page padding.',
    pagePad: { base: '0', coarse: '0' },
    hit: { base: '32px', coarse: '48px' },
    bodyText: { base: '13px', coarse: '13px' },
    // 150ms is the scan-status spot only; nothing else on the floor moves.
    motion: { feedback: '150ms' },
  },
  triage: {
    ...OPERATIONAL_BASE,
    name: 'triage',
    label: 'Triage',
    hint: 'Decide-and-route work — record detail, arrival triage. Industrial identity, roomier density.',
    pagePad: { base: '12px', coarse: '16px' },
    hit: { base: '32px', coarse: '48px' },
    bodyText: { base: '14px', coarse: '16px' },
    motion: { feedback: '120ms' },
  },
  counter: {
    name: 'counter',
    label: 'Counter',
    hint: 'Customer-facing counter tablet — soft corners, 16px, big targets.',
    surfaces: SLATE_SURFACES,
    radius: '12px',
    radiusPill: '9999px',
    pagePad: { base: '16px', coarse: '24px' },
    hit: { base: '40px', coarse: '48px' },
    hitCta: { base: '56px', coarse: '56px' },
    bodyText: { base: '16px', coarse: '16px' },
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
    radiusPill: '9999px',
    pagePad: { base: '16px', coarse: '16px' },
    hit: { base: '32px', coarse: '48px' },
    bodyText: { base: '15px', coarse: '16px' },
    motion: { feedback: '200ms', pulse: '1200ms' },
  },
} satisfies Record<ModeName, ModeSpec>;

export const MODE_NAMES = Object.keys(MODE_REGISTRY) as ModeName[];

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
 * `bar` / `control` / `warn` have no neutral twin; their dark fallbacks are the
 * nearest theme role, and the light block below pins the mode literal.
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
};

const SURFACE_KEYS = Object.keys(MODE_COLOR_VAR_FALLBACK) as (keyof ModeSurfaces)[];

function modeSelector(name: ModeName): string {
  return `[data-mode='${name}']`;
}

/** The grain layers, deepest first — the order the stylesheet and guard walk. */
export const GRAIN_DEPTHS = ['well', 'canvas', 'bar', 'inverse'] as const satisfies readonly (keyof ModeGrain)[];

/**
 * Surface utilities each grain depth rides on. `bg-mode-*` are the industrial
 * roles; the neutral `bg-surface-*` utilities are remapped to those same roles
 * inside a light region, so every component there gets the depth ladder with
 * no per-component class. Outside a region the vars are unset → no grain.
 */
const GRAIN_SURFACES: Readonly<Record<keyof ModeGrain, readonly string[]>> = {
  well: ['bg-mode-well', 'bg-surface-sunken'],
  canvas: ['bg-mode-canvas', 'bg-surface-canvas'],
  bar: ['bg-mode-bar'],
  inverse: ['bg-mode-ink'],
};

/**
 * One 160px tile of greyscale fractal noise, as a base64 SVG data URI. A
 * single repeating tile on the surface — no PNG, no overlay element, nothing
 * per row — so a long ledger scrolls exactly as before.
 *
 * The noise is flattened to opaque grey and contrast-stretched to the full
 * black↔white swing before `opacity` applies: raw turbulence clusters around
 * mid-grey with a translucent alpha, which at 4% renders as a flat tint.
 * Full swing is also the worst case the contrast guard measures.
 */
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

function baseDeclarations(spec: ModeSpec): string[] {
  const hitCta = spec.hitCta ?? spec.hit;
  const lines = SURFACE_KEYS.map((key) => `  --mode-${key}: ${MODE_COLOR_VAR_FALLBACK[key]};`);
  lines.push(
    `  --mode-warn-text: var(--ds-color-text-warning);`,
    `  --mode-radius: ${spec.radius};`,
    `  --mode-radius-pill: ${spec.radiusPill};`,
    `  --mode-page-pad: ${spec.pagePad.base};`,
    `  --mode-hit: ${spec.hit.base};`,
    `  --mode-hit-cta: ${hitCta.base};`,
    `  --mode-text-body: ${spec.bodyText.base};`,
    `  --mode-motion-feedback: ${spec.motion.feedback};`,
    `  --mode-motion-press: ${spec.motion.press ?? spec.motion.feedback};`,
    `  --mode-motion-pulse: ${spec.motion.pulse ?? '0s'};`,
  );
  if (spec.brand) lines.push(`  --mode-brand: ${spec.brand};`);
  // Every region resets the ladder, so a nested ungrained region (assistant
  // rail) never inherits its parent's grain; the light block sets the values.
  for (const depth of GRAIN_DEPTHS) lines.push(`  --mode-grain-${depth}: none;`);
  lines.push('  color: var(--mode-ink);');
  return lines;
}

function lightDeclarations(spec: ModeSpec): string[] {
  const lines = Object.entries(MODE_NEUTRAL_REMAP).map(
    ([themeKey, surface]) => `  --ds-color-${themeKey}: ${spec.surfaces[surface]};`,
  );
  // The theme-less roles pin their literal on light; the rest follow the remap.
  lines.push(`  --mode-bar: ${spec.surfaces.bar};`, `  --mode-control: ${spec.surfaces.control};`);
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

/**
 * The generated mode stylesheet — injected once by the web's app/layout.tsx
 * as `<style id="app-mode-registry">` and written into generated/tokens.css
 * for the desktop bundle. A nested region re-declares every var on its own
 * root, so the innermost region always wins by inheritance.
 */
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
  // `:where()` keeps these at zero specificity, so a component's own
  // background-image (hatched spine, gradient) always wins over the grain.
  blocks.push(
    ...GRAIN_DEPTHS.map(
      (depth) =>
        `:where(${GRAIN_SURFACES[depth].map((cls) => `.${cls}`).join(', ')}) {\n  background-image: var(--mode-grain-${depth}, none);\n}`,
    ),
  );
  blocks.push(
    `@media (prefers-reduced-motion: reduce) {\n  [data-mode] {\n    --mode-motion-feedback: 0ms;\n    --mode-motion-press: 0ms;\n    --mode-motion-pulse: 0s;\n  }\n}`,
  );
  return blocks.join('\n\n');
}
