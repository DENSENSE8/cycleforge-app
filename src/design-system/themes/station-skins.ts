/**
 * Scan-station skins — a second theme axis on top of the app palette.
 *
 * App colour (`data-theme`) owns the warehouse. This catalog owns Color for the scan
 * centre: band headers, routed wells, working plates, serial/cube slots, ink.
 * Depth (bevel width + grain) is a sibling axis in station-depths.ts.
 * Every Unbox-family station reads the same {@link STATION_SCAN_WELL_CLASS}
 * tokens; flipping a skin restyles Arrival, Pack, Testing, Scan-out, Search,
 * and Unbox together. No per-station fill forks.
 *
 * Industrial is the default and is the ABSENCE of `data-station-skin`, the
 * same way light is the absence of `data-theme`.
 *
 * Character skins (Coal, Porcelain, High-vis, …) use absolute fills so the
 * trough keeps its material on Light and Ember alike. House color is the
 * exception: mill tokens plus a live mix of `--ds-color-accent-bg`.
 *
 * design-mcp introspects this file as `ds_tokens({ axis: 'station-skin' })`
 * and `design://tokens/station-skin`. Adding a skin is a row here — never a
 * fill fork on Unbox / Pack / Scan-out.
 */

export const STATION_SKIN_VAR_KEYS = [
  'header',
  'well',
  'plate',
  'slot',
  'bar',
  'row-hover',
  'header-hover',
  'bevel-shadow',
  'bevel-highlight',
  'ink',
  'ink-muted',
] as const;

export type StationSkinVarKey = (typeof STATION_SKIN_VAR_KEYS)[number];

export type StationSkinVars = Record<StationSkinVarKey, string>;

export type StationSkinGroup = 'mill' | 'material' | 'atmosphere' | 'tenant';

export const STATION_SKIN_GROUP_ORDER: StationSkinGroup[] = [
  'mill',
  'material',
  'atmosphere',
  'tenant',
];

export const STATION_SKIN_GROUP_LABEL: Record<StationSkinGroup, string> = {
  mill: 'Mill',
  material: 'Material',
  atmosphere: 'Atmosphere',
  tenant: 'Tenant',
};

export interface StationSkin {
  name: StationSkinName;
  label: string;
  hint: string;
  group: StationSkinGroup;
  vars: StationSkinVars;
  /** Swatches for the Appearance picker (resolved against light industrial). */
  preview: { header: string; well: string; plate: string; slot: string };
}

export type StationSkinName =
  | 'industrial'
  | 'bench'
  | 'coal'
  | 'porcelain'
  | 'anodized'
  | 'paper-mill'
  | 'high-vis'
  | 'icehouse'
  | 'night-shift'
  | 'dock-light'
  | 'matcha'
  | 'harbor'
  | 'foundry'
  | 'greenhouse'
  | 'studio'
  | 'house-color';

function hoverFrom(well: string): string {
  return `color-mix(in srgb, ${well} 40%, transparent)`;
}

const INDUSTRIAL_VARS: StationSkinVars = {
  header: 'transparent',
  well: 'var(--ds-color-surface-strong)',
  plate: 'var(--ds-color-surface-accent)',
  slot: 'var(--ds-color-surface-strong)',
  bar: 'var(--ds-color-background-surface)',
  'row-hover': 'var(--ds-color-surface-hover)',
  'header-hover': 'var(--ds-color-surface-hover)',
  'bevel-shadow': 'var(--ds-color-border-emphasis)',
  'bevel-highlight': 'var(--ds-color-background-canvas)',
  ink: 'var(--ds-color-text-primary)',
  'ink-muted': 'var(--ds-color-text-secondary)',
};

const BENCH_VARS: StationSkinVars = {
  header: 'var(--ds-color-surface-bench)',
  well: 'var(--ds-color-surface-trough)',
  plate: 'var(--ds-color-surface-plate)',
  slot: 'var(--ds-color-surface-slot)',
  bar: 'var(--ds-color-surface-plate)',
  'row-hover': 'var(--ds-color-surface-plate)',
  'header-hover': hoverFrom('var(--ds-color-surface-trough)'),
  'bevel-shadow': 'var(--ds-color-border-stain)',
  'bevel-highlight': 'var(--ds-color-border-ply)',
  ink: 'var(--ds-color-text-primary)',
  'ink-muted': 'var(--ds-color-text-secondary)',
};

/** Ember packing-bench hexes — a coal trough even when the app theme is light. */
const COAL_VARS: StationSkinVars = {
  header: '#211913',
  well: '#16100c',
  plate: '#3a2c20',
  slot: '#0f0c09',
  bar: '#3a2c20',
  'row-hover': '#3a2c20',
  'header-hover': hoverFrom('#16100c'),
  'bevel-shadow': '#0a0705',
  'bevel-highlight': '#9c8971',
  ink: '#f4efe8',
  'ink-muted': '#b8aea0',
};

const PORCELAIN_VARS: StationSkinVars = {
  header: '#f4f1ec',
  well: '#ebe6df',
  plate: '#faf8f5',
  slot: '#c5c0b8',
  bar: '#faf8f5',
  'row-hover': '#faf8f5',
  'header-hover': hoverFrom('#ebe6df'),
  'bevel-shadow': '#8a8580',
  'bevel-highlight': '#c5d4e0',
  ink: '#1a1714',
  'ink-muted': '#5c564e',
};

const ANODIZED_VARS: StationSkinVars = {
  header: '#c5cdd4',
  well: '#3d454c',
  plate: '#9aa8b2',
  slot: '#1e2428',
  bar: '#9aa8b2',
  'row-hover': '#9aa8b2',
  'header-hover': hoverFrom('#3d454c'),
  'bevel-shadow': '#121518',
  'bevel-highlight': '#e8eef2',
  ink: '#eef3f7',
  'ink-muted': '#9aabb8',
};

const PAPER_MILL_VARS: StationSkinVars = {
  header: '#d4b896',
  well: '#e8dcc8',
  plate: '#f3ead9',
  slot: '#c4a574',
  bar: '#f3ead9',
  'row-hover': '#f3ead9',
  'header-hover': hoverFrom('#e8dcc8'),
  'bevel-shadow': '#6b5344',
  'bevel-highlight': '#f7f1e4',
  ink: '#1a1714',
  'ink-muted': '#5c564e',
};

const HIGH_VIS_VARS: StationSkinVars = {
  header: '#1a1a1a',
  well: '#2a2a2a',
  plate: '#d4c20a',
  slot: '#0d0d0d',
  bar: '#2a2a2a',
  'row-hover': '#d4c20a',
  'header-hover': hoverFrom('#2a2a2a'),
  'bevel-shadow': '#0a0a0a',
  'bevel-highlight': '#f0e6a0',
  ink: '#f5f5f0',
  'ink-muted': '#c8c8a8',
};

const ICEHOUSE_VARS: StationSkinVars = {
  header: '#d5dde4',
  well: '#b8c5d0',
  plate: '#eef3f7',
  slot: '#6b7c8a',
  bar: '#d5dde4',
  'row-hover': '#eef3f7',
  'header-hover': hoverFrom('#b8c5d0'),
  'bevel-shadow': '#4a5a66',
  'bevel-highlight': '#f4f8fb',
  ink: '#1a2834',
  'ink-muted': '#4a5a66',
};

const NIGHT_SHIFT_VARS: StationSkinVars = {
  header: '#1c2228',
  well: '#151a20',
  plate: '#2c3844',
  slot: '#0c0f12',
  bar: '#2c3844',
  'row-hover': '#2c3844',
  'header-hover': hoverFrom('#151a20'),
  'bevel-shadow': '#07090b',
  'bevel-highlight': '#8a9aaa',
  ink: '#eef3f7',
  'ink-muted': '#9aabb8',
};

const DOCK_LIGHT_VARS: StationSkinVars = {
  header: '#3d2a14',
  well: '#2a1c0e',
  plate: '#c4a574',
  slot: '#1a1108',
  bar: '#c4a574',
  'row-hover': '#c4a574',
  'header-hover': hoverFrom('#2a1c0e'),
  'bevel-shadow': '#140e08',
  'bevel-highlight': '#e8d5b0',
  ink: '#f4efe8',
  'ink-muted': '#b8aea0',
};

const MATCHA_VARS: StationSkinVars = {
  header: '#d4dcc8',
  well: '#b8c4a4',
  plate: '#e8eedc',
  slot: '#6b7a54',
  bar: '#e8eedc',
  'row-hover': '#e8eedc',
  'header-hover': hoverFrom('#b8c4a4'),
  'bevel-shadow': '#4a5640',
  'bevel-highlight': '#f0f4e4',
  ink: '#1a1714',
  'ink-muted': '#5c564e',
};

const HARBOR_VARS: StationSkinVars = {
  header: '#4a5c6e',
  well: '#2c3e50',
  plate: '#c5d0d8',
  slot: '#1a2834',
  bar: '#c5d0d8',
  'row-hover': '#c5d0d8',
  'header-hover': hoverFrom('#2c3e50'),
  'bevel-shadow': '#0f1820',
  'bevel-highlight': '#e4d5c0',
  ink: '#eef3f7',
  'ink-muted': '#9aabb8',
};

const FOUNDRY_VARS: StationSkinVars = {
  header: '#2a2420',
  well: '#1c1816',
  plate: '#5c4a38',
  slot: '#0e0c0a',
  bar: '#2a2420',
  'row-hover': '#5c4a38',
  'header-hover': hoverFrom('#1c1816'),
  'bevel-shadow': '#080706',
  'bevel-highlight': '#a89068',
  ink: '#f4efe8',
  'ink-muted': '#b8aea0',
};

const GREENHOUSE_VARS: StationSkinVars = {
  header: '#8fa87a',
  well: '#5c7a4a',
  plate: '#d4e4c8',
  slot: '#3d4a32',
  bar: '#d4e4c8',
  'row-hover': '#d4e4c8',
  'header-hover': hoverFrom('#5c7a4a'),
  'bevel-shadow': '#2a3224',
  'bevel-highlight': '#e8f0dc',
  ink: '#1a1714',
  'ink-muted': '#5c564e',
};

const STUDIO_VARS: StationSkinVars = {
  header: '#141414',
  well: '#0a0a0a',
  plate: '#e8e6e0',
  slot: '#050505',
  bar: '#141414',
  'row-hover': '#e8e6e0',
  'header-hover': hoverFrom('#0a0a0a'),
  'bevel-shadow': '#000000',
  'bevel-highlight': '#f5f3ee',
  ink: '#f5f3ee',
  'ink-muted': '#a8a49c',
};

const HOUSE_COLOR_VARS: StationSkinVars = {
  ...INDUSTRIAL_VARS,
  plate:
    'color-mix(in srgb, var(--ds-color-accent-bg) 35%, var(--ds-color-surface-accent))',
  'row-hover':
    'color-mix(in srgb, var(--ds-color-accent-bg) 22%, var(--ds-color-surface-hover))',
};

export const STATION_SKINS: Record<StationSkinName, StationSkin> = {
  industrial: {
    name: 'industrial',
    label: 'Industrial',
    hint: 'Carved mill — strong well, accent plate.',
    group: 'mill',
    vars: INDUSTRIAL_VARS,
    preview: { header: '#ffffff', well: '#e2e8f0', plate: '#dbeafe', slot: '#e2e8f0' },
  },
  bench: {
    name: 'bench',
    label: 'Packing bench',
    hint: 'Birch headers, oiled trough, maple plate.',
    group: 'mill',
    vars: BENCH_VARS,
    preview: { header: '#efe4cf', well: '#dcc9a8', plate: '#f4ead6', slot: '#b8956c' },
  },
  coal: {
    name: 'coal',
    label: 'Coal',
    hint: 'Warm stained wells — ember trough on any theme.',
    group: 'mill',
    vars: COAL_VARS,
    preview: { header: '#211913', well: '#16100c', plate: '#3a2c20', slot: '#0f0c09' },
  },
  porcelain: {
    name: 'porcelain',
    label: 'Porcelain',
    hint: 'Packing-slip ceramic — quiet glaze, ink lips.',
    group: 'material',
    vars: PORCELAIN_VARS,
    preview: { header: '#f4f1ec', well: '#ebe6df', plate: '#faf8f5', slot: '#c5c0b8' },
  },
  anodized: {
    name: 'anodized',
    label: 'Anodized',
    hint: 'CNC aluminum — graphite bore, brushed plate.',
    group: 'material',
    vars: ANODIZED_VARS,
    preview: { header: '#c5cdd4', well: '#3d454c', plate: '#9aa8b2', slot: '#1e2428' },
  },
  'paper-mill': {
    name: 'paper-mill',
    label: 'Paper mill',
    hint: 'Kraft header, newsprint well — fiber, not timber.',
    group: 'material',
    vars: PAPER_MILL_VARS,
    preview: { header: '#d4b896', well: '#e8dcc8', plate: '#f3ead9', slot: '#c4a574' },
  },
  'high-vis': {
    name: 'high-vis',
    label: 'High-vis',
    hint: 'Black mill, safety-yellow plate — only the armed row shouts.',
    group: 'material',
    vars: HIGH_VIS_VARS,
    preview: { header: '#1a1a1a', well: '#2a2a2a', plate: '#d4c20a', slot: '#0d0d0d' },
  },
  icehouse: {
    name: 'icehouse',
    label: 'Icehouse',
    hint: 'Cold-chain frost steel — pale trough, ice plate.',
    group: 'material',
    vars: ICEHOUSE_VARS,
    preview: { header: '#d5dde4', well: '#b8c5d0', plate: '#eef3f7', slot: '#6b7c8a' },
  },
  'night-shift': {
    name: 'night-shift',
    label: 'Night shift',
    hint: 'Blue-steel graveyard — cooler than Coal.',
    group: 'atmosphere',
    vars: NIGHT_SHIFT_VARS,
    preview: { header: '#1c2228', well: '#151a20', plate: '#2c3844', slot: '#0c0f12' },
  },
  'dock-light': {
    name: 'dock-light',
    label: 'Dock light',
    hint: 'Sodium-vapor outbound — warm well, sand plate.',
    group: 'atmosphere',
    vars: DOCK_LIGHT_VARS,
    preview: { header: '#3d2a14', well: '#2a1c0e', plate: '#c4a574', slot: '#1a1108' },
  },
  matcha: {
    name: 'matcha',
    label: 'Matcha',
    hint: 'Tea-stained mill — moss well, pale leaf plate.',
    group: 'atmosphere',
    vars: MATCHA_VARS,
    preview: { header: '#d4dcc8', well: '#b8c4a4', plate: '#e8eedc', slot: '#6b7a54' },
  },
  harbor: {
    name: 'harbor',
    label: 'Harbor',
    hint: 'Slate-blue receiving — rope-cream lips.',
    group: 'atmosphere',
    vars: HARBOR_VARS,
    preview: { header: '#4a5c6e', well: '#2c3e50', plate: '#c5d0d8', slot: '#1a2834' },
  },
  foundry: {
    name: 'foundry',
    label: 'Foundry',
    hint: 'Iron well, muted brass — heavy-goods mill.',
    group: 'atmosphere',
    vars: FOUNDRY_VARS,
    preview: { header: '#2a2420', well: '#1c1816', plate: '#5c4a38', slot: '#0e0c0a' },
  },
  greenhouse: {
    name: 'greenhouse',
    label: 'Greenhouse',
    hint: 'Moss returns / refurb — pale leaf plate.',
    group: 'atmosphere',
    vars: GREENHOUSE_VARS,
    preview: { header: '#8fa87a', well: '#5c7a4a', plate: '#d4e4c8', slot: '#3d4a32' },
  },
  studio: {
    name: 'studio',
    label: 'Studio',
    hint: 'Photo-bay black well, daylight working table.',
    group: 'atmosphere',
    vars: STUDIO_VARS,
    preview: { header: '#141414', well: '#0a0a0a', plate: '#e8e6e0', slot: '#050505' },
  },
  'house-color': {
    name: 'house-color',
    label: 'House color',
    hint: 'Industrial mill — working plate tints from your accent.',
    group: 'tenant',
    vars: HOUSE_COLOR_VARS,
    preview: {
      header: '#ffffff',
      well: '#e2e8f0',
      plate: 'var(--ds-color-accent-bg)',
      slot: '#e2e8f0',
    },
  },
};

/** Insertion order of {@link STATION_SKINS} — typed like THEME_NAMES for z.enum. */
export const STATION_SKIN_NAMES = Object.keys(STATION_SKINS) as StationSkinName[];
export const DEFAULT_STATION_SKIN: StationSkinName = 'industrial';

export function isStationSkinName(value: unknown): value is StationSkinName {
  return typeof value === 'string' && value in STATION_SKINS;
}

export function resolveStationSkin(value: unknown): StationSkin {
  return isStationSkinName(value) ? STATION_SKINS[value] : STATION_SKINS.industrial;
}

function skinVarDeclarations(skin: StationSkin, indent = '  '): string {
  return STATION_SKIN_VAR_KEYS.map(
    (key) => `${indent}--ds-station-${key}: ${skin.vars[key]};`,
  ).join('\n');
}

/**
 * Displays column + leaf interiors — remap app chrome onto station Color.
 * Canvas is included so empty wells / conversation shells / vendor slots
 * inside the column stop reading as light-theme islands on Coal / Porcelain.
 * Semantic status chips (amber/emerald) stay on palette classes — do not remap.
 */
const STATION_DISPLAYS_SCOPE_CSS = `[data-station-displays] {
  --ds-color-background-surface: var(--ds-station-bar);
  --ds-color-background-canvas: var(--ds-station-well);
  --ds-color-surface-sunken: var(--ds-station-header-hover);
  --ds-color-surface-hover: var(--ds-station-row-hover);
  --ds-color-surface-strong: var(--ds-station-slot);
  --ds-color-border-soft: var(--ds-station-bevel-shadow);
  --ds-color-border-hairline: var(--ds-station-bevel-shadow);
  --ds-color-border-subtle: var(--ds-station-bevel-shadow);
  --ds-color-text-primary: var(--ds-station-ink);
  --ds-color-text-secondary: var(--ds-station-ink-muted);
  --ds-color-text-soft: var(--ds-station-ink-muted);
  --ds-color-text-faint: var(--ds-station-ink-muted);
}`;

export function stationSkinCssText(): string {
  const blocks: string[] = [];
  blocks.push(`:root {\n${skinVarDeclarations(STATION_SKINS.industrial)}\n}`);
  for (const name of STATION_SKIN_NAMES) {
    if (name === 'industrial') continue;
    blocks.push(
      `html[data-station-skin='${name}'] {\n${skinVarDeclarations(STATION_SKINS[name])}\n}`,
    );
  }
  blocks.push(STATION_DISPLAYS_SCOPE_CSS);
  return blocks.join('\n\n');
}

export const stationSkinStyleText = stationSkinCssText();
