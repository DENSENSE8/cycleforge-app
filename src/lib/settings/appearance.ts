/**
 * Appearance settings — UI density, font scale, and page wash.
 * Theme switching lives in staff_preferences (server); wash/density/font are
 * device-local via localStorage and reflected as attributes/CSS vars on <html>.
 */

import { readMigratedItem } from '@/lib/storage/migrate-key';
import {
  applyAppWash,
  DEFAULT_WASH,
  resolveWash,
  WASH_NAMES,
  type WashName,
} from '@/design-system/tokens/app-surface';

const KEY = 'cf.appearance';
const LEGACY_KEY = 'usav.appearance';

export type Density = 'compact' | 'cozy' | 'comfortable';

export interface AppearanceSettings {
  density: Density;
  fontScale: number;
  /** Page wash preset — Unbox/receiving/admin gradient hosts. */
  pageWash: WashName;
}

const DEFAULT_APPEARANCE: AppearanceSettings = {
  density: 'cozy',
  fontScale: 1.0,
  pageWash: DEFAULT_WASH,
};

export const FONT_SCALE_OPTIONS = [0.9, 1.0, 1.1, 1.2] as const;
export const DENSITY_OPTIONS: Density[] = ['compact', 'cozy', 'comfortable'];

export function getAppearance(): AppearanceSettings {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE;
  try {
    const raw = readMigratedItem(window.localStorage, KEY, LEGACY_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<AppearanceSettings>;
    const density: Density = DENSITY_OPTIONS.includes(parsed.density as Density)
      ? (parsed.density as Density)
      : DEFAULT_APPEARANCE.density;
    const fontScaleRaw = Number(parsed.fontScale);
    const fontScale = Number.isFinite(fontScaleRaw) && fontScaleRaw >= 0.8 && fontScaleRaw <= 1.4
      ? fontScaleRaw
      : DEFAULT_APPEARANCE.fontScale;
    const pageWash = resolveWash(parsed.pageWash);
    return { density, fontScale, pageWash };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function setAppearance(patch: Partial<AppearanceSettings>): AppearanceSettings {
  const next = { ...getAppearance(), ...patch };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  applyAppearance(next);
  return next;
}

export function applyAppearance(a: AppearanceSettings = getAppearance()): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-ui-density', a.density);
  root.style.setProperty('--ui-density', a.density);
  root.style.setProperty('--ui-font-scale', String(a.fontScale));
  // Scale the root font-size so rem-based components grow proportionally
  root.style.fontSize = `${16 * a.fontScale}px`;
  applyAppWash(a.pageWash);
}

/** Re-export wash names for Appearance UI without a second import path. */
export { WASH_NAMES, type WashName };
