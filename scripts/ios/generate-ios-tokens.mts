// Renders the web's design tokens for the native iOS app as
// `Sources/CycleForgeDesign/CycleForgeTokens.swift` plus the fixture its test
// holds the Swift to (`Tests/CycleForgeDesignTests/Fixtures/web-tokens.json`),
// both written into the Mac project (scripts/ios/ios-target.mts). Run from the
// web repo root:
//
//   node --import tsx --import ./scripts/register-server-only-shim.cjs scripts/ios/generate-ios-tokens.mts [--check|--stdout]
//
// Every value is READ from the web, as `/m` paints it — nothing here is typed in:
//   colours      tailwind.config.mjs `theme.extend.colors` resolved against the
//                generated theme stylesheet (themes/registry.ts: light + dark)
//                and the task-mode stylesheet (modes/registry.ts) of the mode
//                `/m` runs in (src/lib/routing/mode-registry.ts → triage); plus
//                the stock Tailwind colours the reference screens use
//                (node_modules/tailwindcss/theme.css, OKLCH → sRGB).
//   type         `theme.extend.fontSize` role-* (CF Type) + the stock text-sm /
//                text-xs, the tabular-nums bindings from the config's plugin,
//                the weight ladder (typography/weights.ts). The app draws them
//                in the iPhone system font (operator ruling 2026-10-04): size,
//                weight, line height and tracking are the web's.
//   spacing      spacing.mjs at density 1 (rem × 16).
//   radius       tokens/radius.ts + the mode corner (--mode-radius*).
//   borders      tokens/borders.ts.
//   elevation    styles/globals.css --ds-elev-* (light + dark) and Tailwind's
//                stock --shadow-sm.
//   mode         the `/m` mode's --mode-* measures (coarse pointer: a phone).
//   bars         the chrome's own classes: mobileTopBarClass, MobileScanHeader,
//                MobileV2DetailTopBar, IconButton `touch`, the camera header.
//   feedback     the scan buzz per feedback kind (scan-feedback/play.ts).
// Deterministic: same web source → byte-identical output.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import config from '../../tailwind.config.mjs';
import { spacingScale } from '@/design-system/tokens/spacing';
import { radius } from '@/design-system/tokens/radius';
import { borderWidths } from '@/design-system/tokens/borders';
import { fontWeights } from '@/design-system/tokens/typography/weights';
import { mobileTopBarClass } from '@/design-system/tokens/mobile-viewport';
import { themePaletteStyleText } from '@/design-system/themes/registry';
import { modeRegistryStyleText } from '@/design-system/modes/registry';
import { modeRouteFor } from '@/lib/routing/mode-registry';
import { STATION_CAMERA_HEADER_HEIGHT_CLASS, STATION_CAMERA_PANEL_HEIGHT_CLASS } from '@/components/mobile/station/station-metrics';
import { SCAN_BUZZ } from '@/lib/scan-feedback/play';
import { deliver } from './ios-target.mts';

const SWIFT_PATH = 'Sources/CycleForgeDesign/CycleForgeTokens.swift';
const FIXTURE_PATH = 'Tests/CycleForgeDesignTests/Fixtures/web-tokens.json';
const GENERATOR = 'generate-ios-tokens.mts';
const REM = 16;

// ── CSS text ───────────────────────────────────────────────────────────────
/** The declarations of every block whose selector is exactly `selector` (searched inside `css`), later blocks winning. */
function block(css: string, selector: string): Record<string, string> {
  const head = `${selector} {`;
  const out: Record<string, string> = {};
  let from = 0;
  let found = false;
  for (let at = css.indexOf(head, from); at >= 0; at = css.indexOf(head, from)) {
    // Only a whole, top-level (or explicitly indented) selector: not the tail of a longer one.
    const before = at === 0 ? '\n' : css[at - 1];
    if (before !== '\n' && before !== '}') {
      from = at + head.length;
      continue;
    }
    let depth = 0;
    let start = -1;
    let end = -1;
    for (let i = at; i < css.length; i++) {
      if (css[i] === '{') {
        depth++;
        if (start < 0) start = i + 1;
      } else if (css[i] === '}' && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end < 0) throw new Error(`unclosed CSS block '${selector}'`);
    Object.assign(out, declarations(css.slice(start, end)));
    found = true;
    from = end;
  }
  if (!found) throw new Error(`no CSS block '${selector}'`);
  return out;
}

/** The text of the first `@media` block with this query. */
function media(css: string, query: string): string {
  const at = css.indexOf(`@media ${query} {`);
  if (at < 0) throw new Error(`no @media ${query}`);
  let depth = 0;
  for (let i = at; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(at, i + 1);
  }
  throw new Error(`unclosed @media ${query}`);
}

function declarations(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[match[1]] = match[2].replace(/\s+/g, ' ').trim();
  return out;
}

// ── Colours ────────────────────────────────────────────────────────────────

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

function oklchToRGB(l: number, c: number, h: number): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  const byte = (x: number) => Math.round(Math.min(1, Math.max(0, gamma(x))) * 255);
  return [byte(lin[0]), byte(lin[1]), byte(lin[2])];
}

function parseColor(raw: string): RGBA | null {
  const value = raw.trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (m) {
    const hex = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
  }
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(value);
  if (m) return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : round3(Number(m[4])) };
  m = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value);
  if (m) {
    const [r, g, b] = oklchToRGB(Number(m[1]) / 100, Number(m[2]), Number(m[3]));
    return { r, g, b, a: 1 };
  }
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  return null;
}

type Scheme = 'light' | 'dark';

/** The CSS custom properties in force on a `/m` page, per scheme. */
function pageVars(): Record<Scheme, Record<string, string>> {
  const pathMode = modeRouteFor('/m/scan');
  if (!pathMode?.mode || pathMode.look) throw new Error('/m must resolve to a plain task mode');
  const mode = `[data-mode='${pathMode.mode}']`;
  const modeBase = block(modeRegistryStyleText, mode);
  const modeLight = block(modeRegistryStyleText, `html:not([data-color-scheme='dark']) ${mode}`);
  const coarse = block(media(modeRegistryStyleText, '(pointer: coarse)'), `  ${mode}`);
  const themeLight = block(themePaletteStyleText, ':root');
  const themeDark = block(themePaletteStyleText, "html[data-theme='dark']");
  return {
    light: { ...themeLight, ...modeBase, ...coarse, ...modeLight },
    dark: { ...themeLight, ...themeDark, ...modeBase, ...coarse },
  };
}

const VARS = pageVars();

/** A CSS value with every `var(--x, fallback)` substituted for this scheme. */
function resolveVar(value: string, scheme: Scheme, depth = 0): string | null {
  if (depth > 10) throw new Error(`var() cycle at ${value}`);
  const m = /^var\((--[\w-]+)(?:\s*,\s*(.+))?\)$/.exec(value.trim());
  if (!m) return value.trim();
  const next = VARS[scheme][m[1]] ?? m[2];
  return next === undefined ? null : resolveVar(next, scheme, depth + 1);
}

function colorPair(value: string): { light: RGBA; dark: RGBA } | null {
  const light = resolveVar(value, 'light');
  const dark = resolveVar(value, 'dark');
  const pair = { light: light && parseColor(light), dark: dark && parseColor(dark) };
  return pair.light && pair.dark ? { light: pair.light, dark: pair.dark } : null;
}

const stockTheme = readFileSync(createRequire(import.meta.url).resolve('tailwindcss/theme.css'), 'utf8');
const stock = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(stockTheme);
  if (!m) throw new Error(`tailwindcss/theme.css has no --${name}`);
  return m[1].trim();
};

/** Utility colour keys (`text-default` in `text-text-default`, `surface-card`, `stage`, …) → resolved pair. */
function colors(): Record<string, { light: RGBA; dark: RGBA }> {
  const out: Record<string, { light: RGBA; dark: RGBA }> = {};
  const add = (key: string, value: unknown) => {
    if (typeof value === 'string') {
      const pair = colorPair(value);
      if (pair) out[key] = pair;
    } else if (value && typeof value === 'object') {
      for (const [sub, inner] of Object.entries(value)) add(sub === 'DEFAULT' ? key : `${key}-${sub}`, inner);
    }
  };
  for (const [key, value] of Object.entries(config.theme.extend.colors)) {
    // Brand ramps (navy, …) are not chrome; the semantic + mode + stage keys are.
    if (value && typeof value === 'object' && Object.keys(value).some((k) => /^\d+$/.test(k))) continue;
    add(key, value);
  }
  // Stock Tailwind colours the reference screens paint directly
  // (MobileV2ArrivalPlacement.tsx Unfound pill: bg-amber-100 text-amber-800).
  for (const name of ['amber-100', 'amber-800', 'white', 'black']) add(name, stock(`color-${name}`));
  return out;
}

// ── Type ───────────────────────────────────────────────────────────────────

interface TypeSpec {
  size: number;
  weight: number;
  lineHeight: number;
  trackingEm: number;
  tabularNumbers: boolean;
}

function rem(value: string): number {
  const inner = /^calc\(([\d.]+)rem \* var\(--cf-density, 1\)\)$/.exec(value)?.[1] ?? /^([\d.]+)rem$/.exec(value)?.[1];
  if (!inner) throw new Error(`not a rem length: ${value}`);
  return Number(inner) * REM;
}

function em(value: string, scheme: Scheme = 'light'): number {
  const resolved = resolveVar(value, scheme);
  if (resolved === null) throw new Error(`unresolved tracking ${value}`);
  if (resolved === '0') return 0;
  const m = /^(-?[\d.]+)em$/.exec(resolved);
  if (!m) throw new Error(`tracking is not em: ${value}`);
  return Number(m[1]);
}

/** `.text-role-*` utilities the config's plugins add (tabular figures). */
function pluginUtilities(): Record<string, Record<string, string>> {
  const captured: Record<string, Record<string, string>> = {};
  for (const entry of config.plugins as Array<{ handler?: (api: unknown) => void }>) {
    entry.handler?.({ addUtilities: (utilities: Record<string, Record<string, string>>) => Object.assign(captured, utilities) });
  }
  return captured;
}

function typeRoles(): Record<string, TypeSpec> {
  const plugins = pluginUtilities();
  const out: Record<string, TypeSpec> = {};
  for (const [key, value] of Object.entries(config.theme.extend.fontSize as Record<string, [string, Record<string, string>]>)) {
    if (!key.startsWith('role-')) continue;
    const [size, options] = value;
    out[key] = {
      size: rem(size),
      // No weight in the role = the element's inherited normal weight.
      weight: Number(options.fontWeight ?? fontWeights.regular),
      lineHeight: Number(options.lineHeight),
      trackingEm: em(options.letterSpacing ?? '0'),
      tabularNumbers: plugins[`.text-${key}`]?.fontVariantNumeric === 'tabular-nums',
    };
  }
  // Stock text-sm / text-xs (MobileV2ArrivalPlacement.tsx facts, items, urgency reason).
  for (const name of ['sm', 'xs']) {
    const size = rem(stock(`text-${name}`));
    const lh = /^calc\(([\d.]+) \/ ([\d.]+)\)$/.exec(stock(`text-${name}--line-height`));
    if (!lh) throw new Error(`text-${name} line height`);
    out[`text-${name}`] = { size, weight: fontWeights.regular, lineHeight: round3(Number(lh[1]) / Number(lh[2])), trackingEm: 0, tabularNumbers: false };
  }
  return out;
}

// ── Chrome classes ─────────────────────────────────────────────────────────

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

/** The first string literal after `marker` in `file` that satisfies `test` — fails when the anchor moves. */
function classAfter(file: string, marker: string, test: (classes: string) => boolean): string[] {
  const source = read(file);
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`${file}: no '${marker}'`);
  for (const match of source.slice(at).matchAll(/(["'])([^"'\n]+)\1/g)) {
    if (test(match[2])) return match[2].split(/\s+/);
  }
  throw new Error(`${file}: no class string after '${marker}'`);
}

function spacing(step: string): number {
  const value = (spacingScale as Record<string, string>)[step];
  if (value === undefined) throw new Error(`no spacing step ${step}`);
  if (value === '0px') return 0;
  if (value === '1px') return 1;
  return rem(value);
}

/** `h-14` / `min-h-14` / `h-[3.25rem]` → points. */
function height(classes: string[], prefix: 'h' | 'min-h'): number {
  for (const c of classes) {
    const arbitrary = new RegExp(`^${prefix}-\\[([\\d.]+)rem\\]$`).exec(c);
    if (arbitrary) return Number(arbitrary[1]) * REM;
    const step = new RegExp(`^${prefix}-([\\d.]+)$`).exec(c);
    if (step) return spacing(step[1]);
  }
  throw new Error(`no ${prefix}-* in '${classes.join(' ')}'`);
}

/** `bg-surface-card/95` → the colour key + alpha. */
function fill(classes: string[]): { key: string; alpha: number } {
  const c = classes.find((x) => /^bg-[\w-]+\/\d+$/.test(x));
  if (!c) throw new Error(`no translucent bg-* in '${classes.join(' ')}'`);
  const [key, alpha] = c.slice(3).split('/');
  return { key, alpha: Number(alpha) / 100 };
}

function borderKey(classes: string[]): string {
  const c = classes.find((x) => /^border-border-[\w-]+$/.test(x));
  if (!c) throw new Error(`no border-border-* in '${classes.join(' ')}'`);
  return c.slice('border-'.length);
}

function chrome() {
  const top = mobileTopBarClass.split(/\s+/);
  const scan = classAfter('src/components/mobile/scan/MobileScanHeader.tsx', '<header', (c) => c.includes('h-14'));
  const title = classAfter('src/components/mobile/scan/MobileScanHeader.tsx', '<p', (c) => c.includes('text-['));
  const detail = classAfter('src/components/mobile/v2/MobileV2DetailTopBar.tsx', '<header', (c) => c.includes('min-h-'));
  const touch = classAfter('src/design-system/primitives/IconButton.tsx', 'touch:', (c) => /^h-\d+ w-\d+$/.test(c));
  const cta = classAfter('src/components/mobile/v2/MobileV2ScanCta.tsx', 'rounded', (c) => c.includes('shadow-sm'));
  const titleSize = /^text-\[(\d+)px\]$/.exec(title.find((c) => c.startsWith('text-[')) ?? '');
  const titleTracking = /^tracking-\[(-?[\d.]+)em\]$/.exec(title.find((c) => c.startsWith('tracking-[')) ?? '');
  const titleWeight = title.find((c) => c.startsWith('font-'))?.slice('font-'.length) as keyof typeof fontWeights | undefined;
  if (!titleSize || !titleTracking || !titleWeight || !(titleWeight in fontWeights)) throw new Error('MobileScanHeader title face moved');
  const margin = cta.find((c) => /^m-[\d.]+$/.test(c));
  if (!margin) throw new Error('MobileV2ScanCta lost its m-* inset');
  return {
    topBarHeight: height(top, 'h'),
    topBarFill: fill(top),
    topBarBorder: borderKey(top),
    scanHeaderHeight: height(scan, 'h'),
    scanHeaderFill: fill(scan),
    scanHeaderBorder: borderKey(scan),
    scanHeaderTitle: {
      size: Number(titleSize[1]),
      weight: fontWeights[titleWeight],
      // No leading class: the role-less <p> inherits the body line height.
      lineHeight: typeRoles()['role-body'].lineHeight,
      trackingEm: Number(titleTracking[1]),
      tabularNumbers: false,
    } satisfies TypeSpec,
    detailBarMinHeight: height(detail, 'min-h'),
    detailBarFill: fill(detail),
    detailBarBorder: borderKey(detail),
    touchTarget: height(touch, 'h'),
    barButtonInset: spacing(margin.slice(2)),
    barButtonBorder: borderKey(cta),
    cameraHeaderHeight: height(STATION_CAMERA_HEADER_HEIGHT_CLASS.split(/\s+/), 'h'),
    cameraPanelMinHeight: height(STATION_CAMERA_PANEL_HEIGHT_CLASS.split(/\s+/), 'min-h'),
    cameraPanelViewportShare: (() => {
      const m = /^h-\[(\d+)svh\]$/.exec(STATION_CAMERA_PANEL_HEIGHT_CLASS.split(/\s+/).find((c) => c.endsWith('svh]')) ?? '');
      if (!m) throw new Error('camera panel height is no longer h-[Nsvh]');
      return Number(m[1]) / 100;
    })(),
  };
}

// ── Elevation ──────────────────────────────────────────────────────────────

interface ShadowLayer {
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: RGBA;
}

function shadowLayers(value: string): ShadowLayer[] {
  return value.split(/,(?![^(]*\))/).map((layer) => {
    const m = /^\s*(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?(?:\s+(-?[\d.]+)(?:px)?)?\s+(.+?)\s*$/.exec(layer);
    const color = m && parseColor(m[5]);
    if (!m || !color) throw new Error(`shadow layer '${layer}'`);
    return { x: Number(m[1]), y: Number(m[2]), blur: Number(m[3]), spread: Number(m[4] ?? 0), color };
  });
}

function elevation(): Record<string, { light: ShadowLayer[]; dark: ShadowLayer[] }> {
  const css = read('src/styles/globals.css');
  const light = block(css, ':root');
  const dark = block(css, "html[data-color-scheme='dark']");
  const out: Record<string, { light: ShadowLayer[]; dark: ShadowLayer[] }> = {};
  for (const name of ['soft', 'raised', 'overlay']) {
    const key = `--ds-elev-${name}`;
    if (!light[key] || !dark[key]) throw new Error(`globals.css lacks ${key}`);
    out[`elev-${name}`] = { light: shadowLayers(light[key]), dark: shadowLayers(dark[key]) };
  }
  const sm = shadowLayers(stock('shadow-sm'));
  out.sm = { light: sm, dark: sm };
  return out;
}

// ── Assemble ───────────────────────────────────────────────────────────────

const modeVar = (name: string) => {
  const v = VARS.light[`--mode-${name}`];
  if (v === undefined) throw new Error(`--mode-${name} undeclared`);
  return v;
};
const px = (v: string) => {
  if (/^-?[\d.]+px$/.test(v)) return Number(v.slice(0, -2));
  if (/^-?[\d.]+rem$/.test(v)) return Number(v.slice(0, -3)) * REM;
  if (v === '0') return 0;
  throw new Error(`not a length: ${v}`);
};

const bars = chrome();
const tokens = {
  source: 'web repo scripts/ios/generate-ios-tokens.mts',
  mode: modeRouteFor('/m/scan')!.mode,
  colors: colors(),
  type: { ...typeRoles(), 'scan-header-title': bars.scanHeaderTitle },
  weights: fontWeights,
  spacing: Object.fromEntries(Object.keys(spacingScale).map((step) => [step, spacing(step)])),
  radius: Object.fromEntries(Object.entries(radius).map(([key, value]) => [key, value === '9999px' ? 9999 : px(value)])),
  modeMetrics: {
    radius: px(modeVar('radius')),
    radiusControl: px(modeVar('radius-control')),
    radiusPill: px(modeVar('radius-pill')),
    pagePad: px(modeVar('page-pad')),
    hit: px(modeVar('hit')),
    hitCta: px(modeVar('hit-cta')),
    textBody: px(modeVar('text-body')),
    insetChipX: px(modeVar('inset-chip-x')),
    insetChipY: px(modeVar('inset-chip-y')),
    insetFieldX: px(modeVar('inset-field-x')),
    insetFieldY: px(modeVar('inset-field-y')),
    insetCozyX: px(modeVar('inset-cozy-x')),
    insetCozyY: px(modeVar('inset-cozy-y')),
    insetCardX: px(modeVar('inset-card-x')),
    insetCardY: px(modeVar('inset-card-y')),
    insetEmptyX: px(modeVar('inset-empty-x')),
    insetEmptyY: px(modeVar('inset-empty-y')),
    stackTight: px(modeVar('stack-tight')),
    stackRow: px(modeVar('stack-row')),
    stackSection: px(modeVar('stack-section')),
    rowGap: px(modeVar('row-gap')),
    rowTight: px(modeVar('row-tight')),
  },
  borders: Object.fromEntries(Object.entries(borderWidths).map(([key, value]) => [key, value === '0' ? 0 : px(value)])),
  elevation: elevation(),
  bars,
  // Stock tracking utilities the chrome adds over a role (`tracking-tight` on the bar titles).
  tracking: Object.fromEntries(['tight', 'wider'].map((name) => [name, em(stock(`tracking-${name}`))])),
  buzz: Object.fromEntries(Object.entries(SCAN_BUZZ).map(([kind, pattern]) => [kind, Array.isArray(pattern) ? pattern : [pattern]])),
};

// The chrome fills must name real colours.
for (const fillRef of [tokens.bars.topBarFill, tokens.bars.scanHeaderFill, tokens.bars.detailBarFill]) {
  if (!tokens.colors[fillRef.key]) throw new Error(`bar fill ${fillRef.key} is not a colour token`);
}
for (const key of [tokens.bars.topBarBorder, tokens.bars.scanHeaderBorder, tokens.bars.detailBarBorder, tokens.bars.barButtonBorder]) {
  if (!tokens.colors[key]) throw new Error(`bar border ${key} is not a colour token`);
}

// ── Swift ──────────────────────────────────────────────────────────────────

/** `text-default` → `textDefault`, `0.5` → `s0_5`, `2xl` → `xl2`. */
function ident(key: string, numericPrefix = 's'): string {
  if (/^\d/.test(key) && !/^\d+xl$/.test(key)) return numericPrefix + key.replace('.', '_');
  if (/^\d+xl$/.test(key)) return `xl${key.slice(0, -2)}`;
  if (key === 'DEFAULT') return 'base';
  return key.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

const num = (n: number) => (Number.isInteger(n) ? `${n}` : `${round3(n)}`);
const rgba = (c: RGBA) => `CFRGBA(${c.r}, ${c.g}, ${c.b}, ${num(c.a)})`;
const pair = (p: { light: RGBA; dark: RGBA }) => `CFColorPair(light: ${rgba(p.light)}, dark: ${rgba(p.dark)})`;
const typeSpec = (t: TypeSpec) =>
  `CFTypeSpec(size: ${num(t.size)}, weight: ${t.weight}, lineHeight: ${num(t.lineHeight)}, trackingEm: ${num(t.trackingEm)}, tabularNumbers: ${t.tabularNumbers})`;
const layers = (ls: ShadowLayer[]) =>
  `[${ls.map((l) => `CFShadowLayer(x: ${num(l.x)}, y: ${num(l.y)}, blur: ${num(l.blur)}, spread: ${num(l.spread)}, color: ${rgba(l.color)})`).join(', ')}]`;
const withAlpha = (p: { light: RGBA; dark: RGBA }, alpha: number) => ({
  light: { ...p.light, a: round3(p.light.a * alpha) },
  dark: { ...p.dark, a: round3(p.dark.a * alpha) },
});

/** One Swift namespace: a `static let` per token, then `all` by web key. Entries: [web key, Swift identifier, Swift value]. */
function table(name: string, type: string, entries: Array<[string, string, string]>): string {
  const lets = entries.map(([key, id, value]) => `    /// \`${key}\`\n    public static let ${id}: ${type} = ${value}`);
  const all = entries.map(([key, id]) => `        ${JSON.stringify(key)}: ${id},`);
  return [
    `public enum ${name} {`,
    ...lets,
    '',
    '    /// Every token above by its web key — what `TokenParityTests` holds to the web.',
    `    public static let all: [String: ${type}] = [`,
    ...all,
    '    ]',
    '}',
    '',
  ].join('\n');
}

const colorEntries = Object.entries(tokens.colors).map(([key, value]): [string, string, string] => [key, ident(key), pair(value)]);
const b = tokens.bars;
const swift = `// GENERATED by the web repo's scripts/ios/generate-ios-tokens.mts — do not edit.
// Regenerate (web repo root, cycleforge-lanes/prod):
//   node --import tsx --import ./scripts/register-server-only-shim.cjs scripts/ios/generate-ios-tokens.mts
// Drift check without writing: append --check.
//
// The web's design tokens as \`/m\` paints them (task mode: ${tokens.mode}; a phone is a
// coarse pointer). Colours carry the light and dark scheme; type is drawn in
// the iPhone system font at the web's size, weight, line height and tracking.
import CoreGraphics

${table('CFPalette', 'CFColorPair', colorEntries)}
/// The CF Type roles (\`text-role-*\`), the stock \`text-sm\` / \`text-xs\`, and the
/// Scan header's own title face (MobileScanHeader.tsx).
${table('CFType', 'CFTypeSpec', Object.entries(tokens.type).map(([key, value]) => [key, ident(key), typeSpec(value)]))}
/// The weight ladder (typography/weights.ts) — nothing resolves above it.
${table('CFWeight', 'Int', Object.entries(tokens.weights).map(([key, value]) => [key, ident(key), `${value}`]))}
/// The spacing scale (spacing.mjs) in points at density 1.
${table('CFSpace', 'CGFloat', Object.entries(tokens.spacing).map(([key, value]) => [key, ident(key), num(value)]))}
/// Corner radii (tokens/radius.ts).
${table('CFRadius', 'CGFloat', Object.entries(tokens.radius).map(([key, value]) => [key, ident(key), num(value)]))}
/// The \`/m\` task mode's measures (\`--mode-*\`, coarse pointer).
${table('CFMode', 'CGFloat', Object.entries(tokens.modeMetrics).map(([key, value]) => [key, key, num(value)]))}
/// Border widths (tokens/borders.ts).
${table('CFBorder', 'CGFloat', Object.entries(tokens.borders).map(([key, value]) => [key, ident(key), num(value)]))}
/// Elevation: \`shadow-elev-*\` (styles/globals.css) and the stock \`shadow-sm\`.
${table('CFElevation', 'CFShadowPair', Object.entries(tokens.elevation).map(([key, value]) => [key, ident(key), `CFShadowPair(light: ${layers(value.light)}, dark: ${layers(value.dark)})`]))}
/// The bar chrome: MobileV2TopBar (mobileTopBarClass), MobileScanHeader,
/// MobileV2DetailTopBar, the 44 pt touch button and its inset, the camera
/// panel's header and height (its floor, and its share of the screen height).
${table('CFBar', 'CGFloat', [
  ['topBarHeight', 'topBarHeight', num(b.topBarHeight)],
  ['scanHeaderHeight', 'scanHeaderHeight', num(b.scanHeaderHeight)],
  ['detailBarMinHeight', 'detailBarMinHeight', num(b.detailBarMinHeight)],
  ['touchTarget', 'touchTarget', num(b.touchTarget)],
  ['barButtonInset', 'barButtonInset', num(b.barButtonInset)],
  ['cameraHeaderHeight', 'cameraHeaderHeight', num(b.cameraHeaderHeight)],
  ['cameraPanelMinHeight', 'cameraPanelMinHeight', num(b.cameraPanelMinHeight)],
  ['cameraPanelViewportShare', 'cameraPanelViewportShare', num(b.cameraPanelViewportShare)],
])}
/// Bar fills and rules, with the web's alpha (\`bg-surface-card/95\`).
${table('CFBarColor', 'CFColorPair', [
  ['topBarFill', 'topBarFill', pair(withAlpha(tokens.colors[b.topBarFill.key], b.topBarFill.alpha))],
  ['topBarRule', 'topBarRule', pair(tokens.colors[b.topBarBorder])],
  ['scanHeaderFill', 'scanHeaderFill', pair(withAlpha(tokens.colors[b.scanHeaderFill.key], b.scanHeaderFill.alpha))],
  ['scanHeaderRule', 'scanHeaderRule', pair(tokens.colors[b.scanHeaderBorder])],
  ['detailBarFill', 'detailBarFill', pair(withAlpha(tokens.colors[b.detailBarFill.key], b.detailBarFill.alpha))],
  ['detailBarRule', 'detailBarRule', pair(tokens.colors[b.detailBarBorder])],
  ['barButtonRule', 'barButtonRule', pair(tokens.colors[b.barButtonBorder])],
])}
/// Stock letter-spacing utilities in em (\`tracking-tight\`, \`tracking-wider\`).
${table('CFTracking', 'CGFloat', Object.entries(tokens.tracking).map(([key, value]) => [key, ident(key), num(value)]))}
/// The scan buzz per feedback kind, milliseconds on / off / on (scan-feedback/play.ts SCAN_BUZZ).
${table('CFBuzz', '[Int]', Object.entries(tokens.buzz).map(([key, value]) => [key, ident(key), `[${value.join(', ')}]`]))}`;

/** The fixture is the same data keyed exactly as the Swift \`all\` tables. */
const fixture = {
  source: tokens.source,
  mode: tokens.mode,
  CFPalette: Object.fromEntries(Object.entries(tokens.colors)),
  CFType: tokens.type,
  CFWeight: tokens.weights,
  CFSpace: tokens.spacing,
  CFRadius: tokens.radius,
  CFMode: tokens.modeMetrics,
  CFBorder: tokens.borders,
  CFElevation: tokens.elevation,
  CFBar: {
    topBarHeight: b.topBarHeight,
    scanHeaderHeight: b.scanHeaderHeight,
    detailBarMinHeight: b.detailBarMinHeight,
    touchTarget: b.touchTarget,
    barButtonInset: b.barButtonInset,
    cameraHeaderHeight: b.cameraHeaderHeight,
    cameraPanelMinHeight: b.cameraPanelMinHeight,
    cameraPanelViewportShare: b.cameraPanelViewportShare,
  },
  CFBarColor: {
    topBarFill: withAlpha(tokens.colors[b.topBarFill.key], b.topBarFill.alpha),
    topBarRule: tokens.colors[b.topBarBorder],
    scanHeaderFill: withAlpha(tokens.colors[b.scanHeaderFill.key], b.scanHeaderFill.alpha),
    scanHeaderRule: tokens.colors[b.scanHeaderBorder],
    detailBarFill: withAlpha(tokens.colors[b.detailBarFill.key], b.detailBarFill.alpha),
    detailBarRule: tokens.colors[b.detailBarBorder],
    barButtonRule: tokens.colors[b.barButtonBorder],
  },
  CFTracking: tokens.tracking,
  CFBuzz: tokens.buzz,
};

deliver(GENERATOR, [
  { path: SWIFT_PATH, content: swift },
  { path: FIXTURE_PATH, content: `${JSON.stringify(fixture, null, 2)}\n` },
]);
