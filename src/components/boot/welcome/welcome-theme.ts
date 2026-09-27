/**
 * Welcome themes — declarative data the welcome's renderers paint without
 * new code paths: a palette transform applied on top of the staffer's colour
 * (`--cf-welcome-name`), the ambient shape set, optional particles, and the
 * per-character entry variant. The default theme is the everyday soft lobby;
 * holiday themes (resolved from the Pacific calendar) only swap data.
 *
 * Pure module — no React, no motion — so the animated layer, the static
 * WelcomeBridge twin and BOOT_SPLASH_SCRIPT all read the same geometry.
 */

export type WelcomeColorRole = 'hue' | 'near1' | 'near2' | 'accent' | 'tint';

export interface WelcomeShapeSpec {
  kind: 'circle' | 'pill' | 'squircle' | 'path';
  /** svg path (viewBox 0 0 100 100) when kind === 'path'. */
  d?: string;
  /** vmin. */
  size: readonly [w: number, h: number];
  /** % of viewport, shape centre. */
  anchor: { x: number; y: number };
  /** deg. */
  rotate?: number;
  role: WelcomeColorRole;
  /** 0..1 */
  opacity: number;
  drift: { x: number; y: number; rotate?: number; periodS: number };
}

export interface WelcomeParticleSpec {
  kind: 'snow' | 'leaf' | 'ember' | 'confetti';
  /** Hard cap WELCOME_PARTICLE_CAP. */
  count: number;
  roles: readonly WelcomeColorRole[];
  /** Negative rises (embers). */
  fallVminPerS: number;
  swayPx: number;
}

export interface WelcomePaletteTransform {
  /** Absolute oklch hue for the accent (deg); default = staff hue + 170. */
  accentHue?: number;
  /** Themed accent lightness (oklch L, only with accentHue; default 0.72). */
  accentLightness?: number;
  /** Themed accent chroma (only with accentHue; default 0.13). */
  accentChroma?: number;
  /** Absolute oklch hue for near-1/near-2 (deg), replacing the staff hue as their centre; the spread still applies around it. */
  nearHue?: number;
  /** Deg for near-1/near-2 either side of their centre hue (default 30). */
  nearHueSpread?: number;
  /** Multiplier on derived chroma (default 1). */
  chromaScale?: number;
}

export type WelcomeCharVariant = 'rise' | 'flicker' | 'drop' | 'fade';

export interface WelcomeTheme {
  id: 'default' | 'halloween' | 'thanksgiving' | 'christmas' | 'new-year';
  label: string;
  greeting: string;
  palette: WelcomePaletteTransform;
  shapes: readonly WelcomeShapeSpec[];
  particles?: WelcomeParticleSpec;
  charVariant: WelcomeCharVariant;
}

export const WELCOME_PARTICLE_CAP = 24;

/** Crescent: outer r40 at (50,50) minus r34 at (66,38). */
const CRESCENT_D = 'M46.5 10.2A40 40 0 1 0 87.3 64.5A34 34 0 0 1 46.5 10.2Z';
/** Squat pumpkin (three soft lobes) with a short stem. */
const PUMPKIN_D =
  'M50 30C42 24 30 24 22 30C8 40 8 76 26 86C36 92 44 90 50 86C56 90 64 92 74 86C92 76 92 40 78 30C70 24 58 24 50 30Z' +
  'M46 31C46 22 48 16 54 10L60 14C55 18 54 24 54 31Z';
/** Rounded leaf, tip up. */
const LEAF_D = 'M50 6C80 22 88 60 50 94C12 60 20 22 50 6Z';
/** Five-point star (corners rounded by the path stroke in CSS). */
const STAR_D = 'M50 8L61 38L94 39L68 59L77 91L50 72L23 91L32 59L6 39L39 38Z';
/** Bauble: a round ornament with a small cap. */
const BAUBLE_D = 'M16 58A34 34 0 1 0 84 58A34 34 0 1 0 16 58ZM42 14H58V27H42Z';
/** Streamer: a thin ribbon on one wave across the box (the CSS stroke adds its width). */
const STREAMER_D = 'M5 50C20 30 35 30 50 50S80 70 95 50L95 53C80 73 65 73 50 53S20 33 5 53Z';

const DEFAULT_THEME: WelcomeTheme = {
  id: 'default',
  label: 'Everyday',
  greeting: 'Welcome back',
  palette: {},
  shapes: [
    { kind: 'circle', size: [82, 82], anchor: { x: 9, y: 9 }, role: 'near1', opacity: 1, drift: { x: 42, y: 30, periodS: 14 } },
    { kind: 'circle', size: [68, 68], anchor: { x: 93, y: 95 }, role: 'near2', opacity: 1, drift: { x: -36, y: -40, periodS: 17 } },
    { kind: 'circle', size: [32, 32], anchor: { x: 73, y: 22 }, role: 'near2', opacity: 0.8, drift: { x: -30, y: 34, periodS: 12 } },
    { kind: 'pill', size: [89, 12.5], anchor: { x: 29, y: 74 }, rotate: -8, role: 'near2', opacity: 1, drift: { x: 48, y: -18, periodS: 16 } },
    { kind: 'squircle', size: [16, 16], anchor: { x: 76.5, y: 68 }, rotate: 12, role: 'accent', opacity: 1, drift: { x: -26, y: -30, periodS: 11 } },
  ],
  charVariant: 'rise',
};

const HALLOWEEN_THEME: WelcomeTheme = {
  id: 'halloween',
  label: 'Halloween',
  greeting: 'Happy Halloween',
  // Pumpkin orange.
  palette: { accentHue: 52, accentLightness: 0.7, accentChroma: 0.17, chromaScale: 1.2 },
  shapes: [
    { kind: 'circle', size: [84, 84], anchor: { x: 8, y: 10 }, role: 'near1', opacity: 0.35, drift: { x: 36, y: 26, periodS: 16 } },
    { kind: 'circle', size: [70, 70], anchor: { x: 94, y: 94 }, role: 'near2', opacity: 0.32, drift: { x: -32, y: -34, periodS: 18 } },
    { kind: 'path', d: CRESCENT_D, size: [26, 26], anchor: { x: 80, y: 20 }, rotate: -18, role: 'accent', opacity: 0.35, drift: { x: -14, y: 10, rotate: 4, periodS: 20 } },
    { kind: 'path', d: PUMPKIN_D, size: [17, 17], anchor: { x: 16, y: 76 }, rotate: -6, role: 'accent', opacity: 0.35, drift: { x: 16, y: -18, rotate: 3, periodS: 14 } },
    { kind: 'path', d: PUMPKIN_D, size: [10, 10], anchor: { x: 70, y: 84 }, rotate: 8, role: 'accent', opacity: 0.3, drift: { x: -14, y: -14, rotate: -3, periodS: 12 } },
  ],
  particles: { kind: 'ember', count: 16, roles: ['accent', 'accent', 'near1'], fallVminPerS: -5, swayPx: 14 },
  charVariant: 'flicker',
};

const THANKSGIVING_THEME: WelcomeTheme = {
  id: 'thanksgiving',
  label: 'Thanksgiving',
  greeting: 'Happy Thanksgiving',
  // Amber.
  palette: { accentHue: 68, accentLightness: 0.74, accentChroma: 0.15, chromaScale: 1.15 },
  shapes: [
    { kind: 'circle', size: [80, 80], anchor: { x: 10, y: 8 }, role: 'near1', opacity: 0.34, drift: { x: 38, y: 28, periodS: 15 } },
    { kind: 'circle', size: [66, 66], anchor: { x: 92, y: 96 }, role: 'near2', opacity: 0.3, drift: { x: -34, y: -36, periodS: 17 } },
    { kind: 'path', d: LEAF_D, size: [20, 20], anchor: { x: 78, y: 21 }, rotate: 32, role: 'accent', opacity: 0.35, drift: { x: -18, y: 16, rotate: 8, periodS: 14 } },
    { kind: 'path', d: LEAF_D, size: [14, 14], anchor: { x: 15, y: 72 }, rotate: -24, role: 'accent', opacity: 0.33, drift: { x: 16, y: -14, rotate: -6, periodS: 12 } },
    { kind: 'path', d: LEAF_D, size: [11, 11], anchor: { x: 85, y: 70 }, rotate: 140, role: 'accent', opacity: 0.3, drift: { x: -12, y: -18, rotate: 6, periodS: 16 } },
    { kind: 'path', d: LEAF_D, size: [8, 8], anchor: { x: 24, y: 22 }, rotate: -70, role: 'accent', opacity: 0.28, drift: { x: 10, y: 12, rotate: -5, periodS: 13 } },
  ],
  particles: { kind: 'leaf', count: 14, roles: ['accent', 'accent', 'near1'], fallVminPerS: 7, swayPx: 36 },
  charVariant: 'drop',
};

const CHRISTMAS_THEME: WelcomeTheme = {
  id: 'christmas',
  label: 'Christmas',
  greeting: 'Merry Christmas',
  // Warm red accent; near shades forced to pine green whatever the staff hue.
  palette: { accentHue: 25, accentLightness: 0.62, accentChroma: 0.17, nearHue: 150, nearHueSpread: 14, chromaScale: 1.3 },
  shapes: [
    { kind: 'circle', size: [80, 80], anchor: { x: 8, y: 10 }, role: 'near1', opacity: 0.35, drift: { x: 34, y: 26, periodS: 16 } },
    { kind: 'circle', size: [66, 66], anchor: { x: 94, y: 94 }, role: 'near2', opacity: 0.35, drift: { x: -30, y: -34, periodS: 18 } },
    { kind: 'path', d: STAR_D, size: [16, 16], anchor: { x: 78, y: 18 }, rotate: 8, role: 'accent', opacity: 0.35, drift: { x: -8, y: 8, rotate: 6, periodS: 19 } },
    { kind: 'path', d: BAUBLE_D, size: [10, 10], anchor: { x: 20, y: 24 }, rotate: -8, role: 'accent', opacity: 0.35, drift: { x: 6, y: 12, rotate: 4, periodS: 13 } },
    { kind: 'path', d: BAUBLE_D, size: [8, 8], anchor: { x: 88, y: 40 }, rotate: 10, role: 'near1', opacity: 0.35, drift: { x: -6, y: 10, rotate: -4, periodS: 11 } },
    { kind: 'path', d: BAUBLE_D, size: [9, 9], anchor: { x: 14, y: 80 }, rotate: 6, role: 'accent', opacity: 0.32, drift: { x: 10, y: -12, rotate: -3, periodS: 12 } },
    { kind: 'path', d: STAR_D, size: [8, 8], anchor: { x: 72, y: 82 }, rotate: -12, role: 'near1', opacity: 0.35, drift: { x: -8, y: -10, rotate: -6, periodS: 15 } },
  ],
  particles: { kind: 'snow', count: 24, roles: ['near1', 'near2', 'accent'], fallVminPerS: 6, swayPx: 18 },
  charVariant: 'drop',
};

const NEW_YEAR_THEME: WelcomeTheme = {
  id: 'new-year',
  label: 'New Year',
  greeting: 'Happy New Year',
  // Gold.
  palette: { accentHue: 86, accentLightness: 0.8, accentChroma: 0.15, chromaScale: 1.2 },
  shapes: [
    { kind: 'circle', size: [80, 80], anchor: { x: 9, y: 9 }, role: 'near1', opacity: 0.32, drift: { x: 36, y: 28, periodS: 15 } },
    { kind: 'circle', size: [66, 66], anchor: { x: 93, y: 95 }, role: 'near2', opacity: 0.3, drift: { x: -32, y: -36, periodS: 17 } },
    { kind: 'circle', size: [22, 22], anchor: { x: 78, y: 20 }, role: 'accent', opacity: 0.35, drift: { x: -14, y: 16, periodS: 12 } },
    { kind: 'path', d: STAR_D, size: [10, 10], anchor: { x: 20, y: 26 }, rotate: -10, role: 'accent', opacity: 0.35, drift: { x: 12, y: 14, rotate: -6, periodS: 11 } },
    { kind: 'path', d: STAR_D, size: [7, 7], anchor: { x: 88, y: 46 }, rotate: 14, role: 'accent', opacity: 0.32, drift: { x: -8, y: 10, rotate: 8, periodS: 13 } },
    { kind: 'path', d: STREAMER_D, size: [30, 30], anchor: { x: 22, y: 78 }, rotate: -14, role: 'accent', opacity: 0.35, drift: { x: 24, y: -12, rotate: -4, periodS: 16 } },
    { kind: 'path', d: STREAMER_D, size: [22, 22], anchor: { x: 82, y: 74 }, rotate: 20, role: 'accent', opacity: 0.3, drift: { x: -20, y: -10, rotate: 4, periodS: 14 } },
  ],
  particles: { kind: 'confetti', count: 22, roles: ['accent', 'accent', 'near1', 'near2'], fallVminPerS: 8, swayPx: 24 },
  charVariant: 'rise',
};

export const WELCOME_THEMES: Readonly<Record<WelcomeTheme['id'], WelcomeTheme>> = {
  default: DEFAULT_THEME,
  halloween: HALLOWEEN_THEME,
  thanksgiving: THANKSGIVING_THEME,
  christmas: CHRISTMAS_THEME,
  'new-year': NEW_YEAR_THEME,
};

const WELCOME_TIME_ZONE = 'America/Los_Angeles';

/** Day of month of the 4th Thursday of November (US Thanksgiving) for `year`. */
export function fourthThursdayOfNovember(year: number): number {
  const novFirstWeekday = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const firstThursday = 1 + ((4 - novFirstWeekday + 7) % 7);
  return firstThursday + 21;
}

/** Calendar date (year, 1-based month, day) of `now` in the Pacific zone. */
function pacificDate(now: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: WELCOME_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const part = (type: 'year' | 'month' | 'day') => Number(parts.find((p) => p.type === type)?.value);
  return { year: part('year'), month: part('month'), day: part('day') };
}

function isWelcomeThemeId(value: string): value is WelcomeTheme['id'] {
  return Object.prototype.hasOwnProperty.call(WELCOME_THEMES, value);
}

/**
 * Theme for `now` on the Pacific calendar: Halloween Oct 24–31, Thanksgiving
 * Mon–Fri of the week holding the 4th Thursday of November, Christmas Dec
 * 1–26, New Year Dec 30–Jan 2; otherwise the everyday lobby. `override` (a
 * theme id) is honoured only outside production.
 */
export function resolveWelcomeTheme(now: Date, override?: string | null): WelcomeTheme {
  if (override && process.env.NODE_ENV !== 'production' && isWelcomeThemeId(override)) {
    return WELCOME_THEMES[override];
  }
  const { year, month, day } = pacificDate(now);
  if (month === 10 && day >= 24) return WELCOME_THEMES.halloween;
  if (month === 11) {
    const thursday = fourthThursdayOfNovember(year);
    if (day >= thursday - 3 && day <= thursday + 1) return WELCOME_THEMES.thanksgiving;
  }
  if (month === 12 && day <= 26) return WELCOME_THEMES.christmas;
  if ((month === 12 && day >= 30) || (month === 1 && day <= 2)) return WELCOME_THEMES['new-year'];
  return WELCOME_THEMES.default;
}

/** Themed-accent default lightness/chroma (an absolute colour, the same in light and dark mode). */
const ACCENT_THEMED_L = 0.72;
const ACCENT_THEMED_C = 0.13;
/** Near-shade seed for browsers without relative colour (mixed toward white/black like the staff colour). */
const NEAR_SEED_L = 0.72;
const NEAR_SEED_C = 0.12;

/**
 * CSS custom properties that apply the palette transform on top of
 * --cf-welcome-name (consumed by the `.cf-welcome-root` formulas in
 * globals.css). Empty for the everyday lobby.
 */
export function welcomePaletteStyle(theme: WelcomeTheme): Record<string, string> {
  const { accentHue, accentLightness, accentChroma, nearHue, nearHueSpread, chromaScale } = theme.palette;
  const vars: Record<string, string> = {};
  if (accentHue !== undefined) {
    vars['--welcome-accent-seed'] = `oklch(${accentLightness ?? ACCENT_THEMED_L} ${accentChroma ?? ACCENT_THEMED_C} ${accentHue})`;
  }
  if (nearHue !== undefined) {
    vars['--welcome-near-hue'] = String(nearHue);
    vars['--welcome-near-follow'] = '0';
    vars['--welcome-near-seed'] = `oklch(${NEAR_SEED_L} ${NEAR_SEED_C} ${nearHue})`;
  }
  if (nearHueSpread !== undefined) vars['--welcome-near-spread'] = String(nearHueSpread);
  if (chromaScale !== undefined) vars['--welcome-chroma-scale'] = String(chromaScale);
  return vars;
}

/** CSS colour for each palette role (the `.cf-welcome-root` vars). */
export const WELCOME_ROLE_COLOR: Record<WelcomeColorRole, string> = {
  hue: 'var(--welcome-hue)',
  near1: 'var(--welcome-near-1)',
  near2: 'var(--welcome-near-2)',
  accent: 'var(--welcome-accent)',
  tint: 'var(--welcome-tint)',
};

/** The ambient layer's container (fills the lobby, clips, never takes input). */
export const WELCOME_AMBIENT_LAYER_CLASS = 'pointer-events-none absolute inset-0 overflow-hidden';

/** className of a shape node — `cf-welcome-amb` + kind modifier (globals.css). */
export function welcomeShapeClass(spec: WelcomeShapeSpec): string {
  return `cf-welcome-amb cf-welcome-amb--${spec.kind}`;
}

/**
 * Inline style of a shape node: custom properties only, so the same record
 * serves React `style`, and `el.style.setProperty` in the boot script. The
 * transform stays free for motion; rotation uses the individual property.
 */
export function welcomeShapeStyle(spec: WelcomeShapeSpec): Record<string, string> {
  return {
    '--shape-x': `${spec.anchor.x}%`,
    '--shape-y': `${spec.anchor.y}%`,
    '--shape-w': `${spec.size[0]}vmin`,
    '--shape-h': `${spec.size[1]}vmin`,
    '--shape-rotate': `${spec.rotate ?? 0}deg`,
    '--shape-color': WELCOME_ROLE_COLOR[spec.role],
    '--shape-opacity': String(spec.opacity),
  };
}

export interface SerializedWelcomeTheme {
  vars: Record<string, string>;
  layerClass: string;
  shapes: Array<{ className: string; style: Record<string, string>; svg?: { d: string } }>;
}

/**
 * JSON for BOOT_SPLASH_SCRIPT: palette vars + the exact className / inline
 * style AmbientLayerStatic paints on each shape (path shapes get an
 * `<svg viewBox="0 0 100 100"><path d fill="currentColor"/></svg>` child).
 */
export function serializeWelcomeTheme(theme: WelcomeTheme): string {
  const payload: SerializedWelcomeTheme = {
    vars: welcomePaletteStyle(theme),
    layerClass: WELCOME_AMBIENT_LAYER_CLASS,
    shapes: theme.shapes.map((spec) => ({
      className: welcomeShapeClass(spec),
      style: welcomeShapeStyle(spec),
      ...(spec.kind === 'path' && spec.d ? { svg: { d: spec.d } } : {}),
    })),
  };
  return JSON.stringify(payload);
}

/** Per-kind particle geometry: base size (vmin, w×h), opacity band, spin turns per crossing. */
const PARTICLE_GEOMETRY: Record<WelcomeParticleSpec['kind'], { w: number; h: number; opacity: readonly [number, number]; turns: number }> = {
  snow: { w: 1.4, h: 1.4, opacity: [0.55, 0.85], turns: 0 },
  leaf: { w: 2.4, h: 2.4, opacity: [0.4, 0.6], turns: 1 },
  ember: { w: 1, h: 1, opacity: [0.5, 0.8], turns: 0 },
  confetti: { w: 1.4, h: 0.6, opacity: [0.45, 0.7], turns: 2 },
};

export interface WelcomeParticle {
  /** % of viewport width. */
  x: number;
  /** vmin. */
  w: number;
  h: number;
  opacity: number;
  role: WelcomeColorRole;
  /** Fraction of the crossing to wait before the first pass (0..1). */
  delay: number;
  /** Speed multiplier (0.8..1.25). */
  speed: number;
  /** Sway amplitude px (signed). */
  sway: number;
  /** Whole turns per crossing (signed). */
  turns: number;
}

/** mulberry32 — deterministic, seeded by index so SSR and client agree. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic particle layout (capped at WELCOME_PARTICLE_CAP); no Math.random. */
export function welcomeParticleLayout(spec: WelcomeParticleSpec): WelcomeParticle[] {
  const geometry = PARTICLE_GEOMETRY[spec.kind];
  const count = Math.max(0, Math.min(WELCOME_PARTICLE_CAP, Math.floor(spec.count)));
  const particles: WelcomeParticle[] = [];
  for (let i = 0; i < count; i += 1) {
    const rand = seeded((i + 1) * 2654435761);
    const scale = 0.7 + rand() * 0.6;
    const [lo, hi] = geometry.opacity;
    particles.push({
      // Stratified across the width so particles never clump.
      x: ((i + 0.2 + rand() * 0.6) / count) * 100,
      w: geometry.w * scale,
      h: geometry.h * scale,
      opacity: lo + rand() * (hi - lo),
      role: spec.roles[i % spec.roles.length] ?? 'accent',
      delay: rand(),
      speed: 0.8 + rand() * 0.45,
      sway: spec.swayPx * (0.6 + rand() * 0.4) * (rand() < 0.5 ? -1 : 1),
      turns: geometry.turns * (rand() < 0.5 ? -1 : 1),
    });
  }
  return particles;
}
