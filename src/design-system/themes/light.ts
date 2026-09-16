import type { ThemePalette } from './registry';

/**
 * Light — the default theme. Values are byte-for-byte the ones previously
 * hand-curated in src/styles/globals.css `:root` (the registry now owns them;
 * globals.css keeps only non-theme tokens + the raw-neutral remap).
 *
 * No `accent` block: the per-staff `.theme-<accent>` classes own the accent
 * variables in light-family themes.
 */
export const lightPalette: ThemePalette = {
  name: 'light',
  label: 'Light',
  hint: 'Bright — the default.',
  scheme: 'light',
  preview: { canvas: '#fafafa', card: '#ffffff', accent: '#2563eb', text: '#0f172a' },
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
    // PINNED: `scripts/mobile-ground-guard.ts` asserts this exact hex (verify
    // `Ground`, `ds_mobile_ground`). Change it there in the same commit or the
    // gate fails — which is the point.
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
    // Functional tones — text -600 / pastel -50 surface / -400 border
    'text-success': '#16a34a',
    'text-warning': '#ea580c',
    'text-danger': '#dc2626',
    'text-accent': '#1a3a6b',
    'surface-success': '#f0fdf4',
    'surface-warning': '#fff7ed',
    'surface-danger': '#fef2f2',
    'surface-accent': '#f0f4fb',
    'border-success': '#4ade80',
    'border-warning': '#fb923c',
    'border-danger': '#f87171',
    'border-accent': '#2a4d9a',
    // Extended tone text
    'text-info': '#2563eb', // blue-600
    'text-fulfillment': '#9333ea', // purple-600
    // Solid fills
    'fill-info': '#2563eb',
    'fill-success': '#16a34a',
    'fill-warning': '#f97316',
    'fill-danger': '#ef4444',
    'fill-fulfillment': '#a855f7',
  },
};
