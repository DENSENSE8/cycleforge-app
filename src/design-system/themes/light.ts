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
  preview: { canvas: '#eef2f7', card: '#ffffff', accent: '#2563eb', text: '#0f172a' },
  page: { background: '#ffffff', foreground: '#171717' },
  vars: {
    // Neutral chrome (slate family)
    'text-primary': '#0f172a',
    'text-secondary': '#475569',
    'text-soft': '#64748b',
    'text-faint': '#94a3b8',
    // Page/canvas plane sits a real step BELOW card white (~6%), not the old
    // #f8fafc (~2%). Depth needs something to cast onto: at a 2% delta a
    // raised card's shadow has no ground plane to read against and every
    // surface flattens into one sheet of white. Keep card ↔ canvas separated
    // when tuning; `surface-hover` stays the lighter row wash.
    'background-canvas': '#eef2f7',
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
    'surface-info': '#eff6ff',
    'surface-danger': '#fef2f2',
    'surface-accent': '#f0f4fb',
    'border-success': '#4ade80',
    'border-warning': '#fb923c',
    'border-info': '#60a5fa',
    'border-danger': '#f87171',
    'border-accent': '#2a4d9a',
    // Extended tone text
    'text-info': '#2563eb', // blue-600
    'text-fulfillment': '#9333ea', // purple-600
    'text-gilt': '#9d6b30', // warm caramel-bronze — 4.59:1 on card white
    // Solid fills
    'fill-info': '#2563eb',
    'fill-success': '#16a34a',
    'fill-warning': '#f97316',
    'fill-danger': '#ef4444',
    'fill-fulfillment': '#a855f7',
  },
};
