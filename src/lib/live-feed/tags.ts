/**
 * Package tags — short identifications an operator pins on a package as it
 * moves ("Damaged", "Missing part"), stored in `order_tags` keyed by the
 * order row. Presets are one tap; anything else is a custom tag of up to
 * {@link PACKAGE_TAG_MAX} characters. Client-safe.
 */

export type PackageTagTone = 'danger' | 'warning' | 'info' | 'neutral';

export interface PackageTagPreset {
  label: string;
  tone: PackageTagTone;
}

export const PACKAGE_TAG_PRESETS: readonly PackageTagPreset[] = [
  { label: 'Damaged', tone: 'danger' },
  { label: 'Missing part', tone: 'danger' },
  { label: 'Wrong item', tone: 'danger' },
  { label: 'On hold', tone: 'warning' },
  { label: 'Address issue', tone: 'warning' },
  { label: 'Needs photo', tone: 'info' },
  { label: 'Rush', tone: 'info' },
];

export const PACKAGE_TAG_MAX = 32;

const PRESET_BY_KEY: Readonly<Record<string, PackageTagPreset>> = Object.fromEntries(
  PACKAGE_TAG_PRESETS.map((preset) => [preset.label.toLowerCase(), preset]),
);

/** The stored form of a typed tag: whitespace collapsed, a preset's own casing; `null` when empty or too long. */
export function normalizePackageTag(raw: string): string | null {
  const label = raw.replace(/\s+/g, ' ').trim();
  if (!label || label.length > PACKAGE_TAG_MAX) return null;
  return PRESET_BY_KEY[label.toLowerCase()]?.label ?? label;
}

export function packageTagTone(label: string): PackageTagTone {
  return PRESET_BY_KEY[label.toLowerCase()]?.tone ?? 'neutral';
}
