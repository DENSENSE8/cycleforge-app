import { STATE_TONES } from './state';

/**
 * Light — the default theme's `--ds-color-*` values and page pair. Every
 * platform reads these: the web registry (src/design-system/themes/light.ts →
 * themes/registry.ts), the bundled desktop app (generated/tokens.css) and
 * iOS (generated/DesignTokens.swift).
 *
 * Key order is the web registry's THEME_VAR_KEYS order; the web palette
 * assigns this object to `ThemeVars`, so a missing key is a type error there.
 * Functional tones read STATE_TONES — never a second literal.
 */
export const LIGHT_THEME = {
  page: { background: '#ffffff', foreground: '#171717' },
  vars: {
    // Neutral chrome (slate family)
    'text-primary': '#0f172a',
    'text-secondary': '#475569',
    'text-soft': '#64748b',
    'text-faint': '#94a3b8',
    // ── The page plane: #fafafa, a 2% step under card white ─────────────────
    //
    // Operator ruling 2026-09-15: *"ensure that the FAFAFA token is pinned for
    // a standard background in light mode."* This REVERSES the tuning below it,
    // deliberately, so read both before touching either.
    //
    // It was #eef2f7 — a real ~6% step under card white — on the argument that
    // depth needs something to cast onto: at a 2% delta a raised card's shadow
    // has no ground plane to read against and every surface flattens into one
    // sheet. That is still TRUE, and it is now the accepted cost. The operator
    // had already been pulling the desk the same way (`tokens/desk-stage.ts`:
    // *"the grey read as a gutter around a boxed-in table, and the page should
    // read as one white sheet"*), and the phone/kiosk ground moved to card
    // white outright.
    //
    // CONSEQUENCE, stated so nobody re-derives it as a bug: on this theme,
    // separation is carried by HAIRLINES and borders, not by elevation. A
    // surface that needs to read as raised on #fafafa must draw an edge —
    // `shadow-elev-*` alone will not show. Do not "fix" a flat-looking card by
    // darkening this value back; that is the ruling, not a regression.
    //
    // `surface-hover` (#f8fafc) is now DARKER than the canvas it washes, which
    // is correct: a row hover reads against card white, not against the plane.
    //
    // PINNED: `scripts/mobile-ground-guard.ts` asserts this exact hex in THIS
    // file (verify `Ground`, `ds_mobile_ground`). Change it there in the same
    // commit or the gate fails — which is the point.
    'background-canvas': '#fafafa',
    'background-surface': '#ffffff',
    'surface-sunken': '#f1f5f9',
    'surface-hover': '#f8fafc', // row/interaction wash (≈ the classic gray-50 hover wash)
    'surface-strong': '#e2e8f0', // tracks, skeletons, avatar placeholders (≈ gray-200)
    'surface-bench': '#efe4cf', // birch header strip
    'surface-trough': '#dcc9a8', // oiled routed well
    'surface-plate': '#f4ead6', // maple / aluminum working row
    'surface-slot': '#b8956c', // felt-lined serial / cube pocket
    'surface-inverse': '#0f172a', // dark pills / action bars (≈ gray-900 fill)
    'surface-inverse-hover': '#1e293b', // hover on inverted chrome (≈ gray-800 fill)
    'surface-inverse-raised': '#334155', // chip resting ON an inverse bar (≈ gray-700 fill)
    'surface-inverse-soft': '#475569', // muted standalone dark fill (≈ gray-600 fill)
    'text-inverse': '#f8fafc', // primary text on inverted chrome
    'text-inverse-soft': '#cbd5e1', // secondary text on inverted chrome (≈ gray-300 text)
    'border-subtle': '#e2e8f0',
    'border-default': '#cbd5e1',
    'border-hairline': '#f1f5f9', // near-invisible hairlines (≈ gray-100 hairline)
    'border-emphasis': '#94a3b8', // dashed drop-zones, dotted underlines (≈ gray-400 rule)
    'border-stain': '#6e4e2e', // trough shadow lip (top/left)
    'border-ply': '#e8d5b5', // raw-ply highlight lip (bottom/right; reads on white)
    'border-strong': '#0f172a', // max-emphasis selection outlines (≈ gray-900 border)
    'border-inverse': '#334155', // hairlines on inverted chrome (≈ gray-700 border)
    // Functional tones — STATE_TONES text (-700 for success/warning, -600 else) / pastel -50 surface / -400 border
    'text-success': STATE_TONES.success.text,
    'text-warning': STATE_TONES.warning.text,
    'text-danger': STATE_TONES.danger.text,
    'text-accent': '#1a3a6b',
    'surface-success': STATE_TONES.success.tint,
    'surface-warning': STATE_TONES.warning.tint,
    'surface-danger': STATE_TONES.danger.tint,
    'surface-accent': '#f0f4fb',
    'border-success': STATE_TONES.success.edge,
    'border-warning': STATE_TONES.warning.edge,
    'border-danger': STATE_TONES.danger.edge,
    'border-accent': '#2a4d9a',
    // Extended tone text
    'text-info': STATE_TONES.info.text,
    'text-fulfillment': STATE_TONES.fulfillment.text,
    // Solid fills
    'fill-info': STATE_TONES.info.fill,
    'fill-success': STATE_TONES.success.fill,
    'fill-warning': STATE_TONES.warning.fill,
    'fill-danger': STATE_TONES.danger.fill,
    'fill-fulfillment': STATE_TONES.fulfillment.fill,
  },
} as const;

export type LightThemeVarKey = keyof typeof LIGHT_THEME.vars;

/**
 * The light theme as a standalone `:root` block — the desktop bundle's base
 * layer (generated/tokens.css). The web registry emits the same declarations
 * (plus staff accents and the other themes) itself.
 */
export function lightThemeCssText(): string {
  const lines = Object.entries(LIGHT_THEME.vars).map(([key, value]) => `  --ds-color-${key}: ${value};`);
  lines.push(`  --background: ${LIGHT_THEME.page.background};`, `  --foreground: ${LIGHT_THEME.page.foreground};`);
  return `:root {\n${lines.join('\n')}\n}`;
}
