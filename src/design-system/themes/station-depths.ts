/**
 * Scan-station depth — a second Look axis beside Color (`station-skins.ts`).
 *
 * Color owns fills / bevel hue / ink. Depth owns relief: bevel width and ply
 * grain. Flat is the default and is the ABSENCE of `data-station-depth`, the
 * same way industrial is the absence of `data-station-skin`.
 *
 * design-mcp introspects this file as `ds_tokens({ axis: 'station-depth' })`.
 * Do not bake grain back onto a color row.
 */

export type StationDepthName = 'flat' | 'mill' | 'deep';

export interface StationDepth {
  name: StationDepthName;
  label: string;
  hint: string;
  /** CSS length for inset / raised / leading bevel borders. */
  bevelWidth: string;
  /** Whether `.station-scan-grain` paints ply lines (Deep only). */
  grain: boolean;
}

export const STATION_DEPTHS: Record<StationDepthName, StationDepth> = {
  flat: {
    name: 'flat',
    label: 'Flat',
    hint: 'No bevel, no grain — stacked fills only.',
    bevelWidth: '0px',
    grain: false,
  },
  mill: {
    name: 'mill',
    label: 'Mill',
    hint: 'Industrial relief — 2px bevel, no grain.',
    bevelWidth: '2px',
    grain: false,
  },
  deep: {
    name: 'deep',
    label: 'Deep',
    hint: 'Stronger inset plus ply grain.',
    bevelWidth: '4px',
    grain: true,
  },
};

export const STATION_DEPTH_NAMES = Object.keys(STATION_DEPTHS) as StationDepthName[];
export const DEFAULT_STATION_DEPTH: StationDepthName = 'flat';

export function isStationDepthName(value: unknown): value is StationDepthName {
  return typeof value === 'string' && value in STATION_DEPTHS;
}

export function resolveStationDepth(value: unknown): StationDepth {
  return isStationDepthName(value) ? STATION_DEPTHS[value] : STATION_DEPTHS[DEFAULT_STATION_DEPTH];
}

/** Ply lines — hue follows Color bevel vars; painted only at Deep. */
const GRAIN_BODY = `
  background-image:
    repeating-linear-gradient(
      90deg,
      transparent 0,
      transparent 3px,
      color-mix(in srgb, var(--ds-station-bevel-shadow) 9%, transparent) 3px,
      color-mix(in srgb, var(--ds-station-bevel-shadow) 9%, transparent) 4px
    ),
    repeating-linear-gradient(
      0deg,
      transparent 0,
      transparent 11px,
      color-mix(in srgb, var(--ds-station-bevel-highlight) 14%, transparent) 11px,
      color-mix(in srgb, var(--ds-station-bevel-highlight) 14%, transparent) 12px
    );
`;

/**
 * Emits `:root` flat defaults + `html[data-station-depth]` overrides + Deep grain.
 * Inject beside station-skin CSS in `app/layout.tsx`.
 */
export function stationDepthCssText(): string {
  const defaultDepth = STATION_DEPTHS[DEFAULT_STATION_DEPTH];
  const blocks: string[] = [
    [
      ':root {',
      `  --ds-station-bevel-width: ${defaultDepth.bevelWidth};`,
      `  --ds-station-grain-alpha: ${defaultDepth.grain ? '1' : '0'};`,
      '}',
    ].join('\n'),
  ];

  for (const name of STATION_DEPTH_NAMES) {
    if (name === DEFAULT_STATION_DEPTH) continue;
    const depth = STATION_DEPTHS[name];
    blocks.push(
      [
        `html[data-station-depth='${name}'] {`,
        `  --ds-station-bevel-width: ${depth.bevelWidth};`,
        `  --ds-station-grain-alpha: ${depth.grain ? '1' : '0'};`,
        '}',
      ].join('\n'),
    );
  }

  blocks.push(`html[data-station-depth='deep'] .station-scan-grain {${GRAIN_BODY}}`);

  return blocks.join('\n\n');
}

export const stationDepthStyleText = stationDepthCssText();
