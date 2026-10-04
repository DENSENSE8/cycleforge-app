import type { ThemePalette } from './registry';

/** Paper — warm cream light. */
export const paperPalette: ThemePalette = {
  name: 'paper',
  label: 'Paper',
  hint: 'Warm cream — calm, print-like ink on paper.',
  scheme: 'light',
  preview: { canvas: '#f7f3ec', card: '#fffdf9', accent: '#b45309', text: '#292319' },
  page: { background: '#f7f3ec', foreground: '#292319' },
  vars: {
    // Neutral chrome — warm stone
    'text-primary': '#292319',
    'text-secondary': '#433c2e', // ≥9:1 on every surface (owner 2026-10-03: subtitles read easily)
    'text-soft': '#5d5644', // ≥6:1 on every surface
    'text-faint': '#6e6755', // ≥4.5 on every surface — text, never a sub-AA tier
    'background-canvas': '#f7f3ec',
    'background-surface': '#fffdf9',
    'surface-sunken': '#f0e9dd',
    'surface-hover': '#f7f2e9',
    'surface-strong': '#e3daca',
    'surface-bench': '#f3ead8',
    'surface-trough': '#e3d4b5',
    'surface-plate': '#faf3e4',
    'surface-slot': '#c4a07a',
    'surface-inverse': '#1c1917',
    'surface-inverse-hover': '#292524',
    'surface-inverse-raised': '#44403c',
    'surface-inverse-soft': '#57534e',
    'text-inverse': '#fafaf9',
    'text-inverse-soft': '#d6d3d1',
    'border-subtle': '#e6ddcc',
    'border-default': '#cbc0aa',
    'border-hairline': '#f0e9dd',
    'border-emphasis': '#a49a83',
    'border-stain': '#6b4f32',
    'border-ply': '#eadcc0',
    'border-strong': '#292319',
    'border-inverse': '#44403c',
    // Functional tones — deepened one step for the warm canvas
    'text-success': '#166534', // deepened one step — ≥4.5 on the warm pill fill
    'text-warning': '#9a3412', // deepened one step — ≥4.5 on the warm pill fill
    'text-danger': '#b91c1c',
    'text-accent': '#713f12',
    'surface-success': '#eaf2e0',
    'surface-warning': '#f9edd8',
    'surface-danger': '#f8e7df',
    'surface-accent': '#f2ead6',
    'border-success': '#7cc389',
    'border-warning': '#dfa356',
    'border-danger': '#e18a72',
    'border-accent': '#8a6a3a',
    // Extended tone text
    'text-info': '#1d4ed8',
    'text-fulfillment': '#7e22ce',
    // Solid fills
    'fill-info': '#1d4ed8',
    'fill-success': '#15803d',
    'fill-warning': '#d97706',
    'fill-danger': '#dc2626',
    'fill-fulfillment': '#9333ea',
  },
};
