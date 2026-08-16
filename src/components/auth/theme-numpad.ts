/**
 * Staff-identity PIN numpad theme — one map for {@link StaffPinPad} and
 * {@link SetPinPad}. Identity hues (emerald / amber / …), not chrome tokens.
 */

import { focusRing } from '@/design-system/tokens/focus-ring';
import type { StationTheme } from '@/utils/staff-colors';

export type NumpadThemeFace = {
  primaryBg: string;
  primaryHover: string;
  dotActive: string;
  accentText: string;
  haloFrom: string;
  passkeyHover: string;
  ring: string;
};

export const THEME_NUMPAD: Record<StationTheme, NumpadThemeFace> = {
  green:     { primaryBg: 'bg-emerald-600',  primaryHover: 'hover:bg-emerald-700', dotActive: 'bg-emerald-600',  accentText: 'text-emerald-700',  haloFrom: 'from-emerald-200/60',  passkeyHover: 'hover:bg-emerald-50',  ring: focusRing('field', 'success') },
  blue:      { primaryBg: 'bg-blue-600',     primaryHover: 'hover:bg-blue-700',    dotActive: 'bg-blue-600',     accentText: 'text-blue-700',     haloFrom: 'from-blue-200/60',     passkeyHover: 'hover:bg-blue-50',     ring: focusRing('field', 'accent') },
  purple:    { primaryBg: 'bg-purple-600',   primaryHover: 'hover:bg-purple-700',  dotActive: 'bg-purple-600',   accentText: 'text-purple-700',   haloFrom: 'from-purple-200/60',   passkeyHover: 'hover:bg-purple-50',   ring: 'focus:ring-purple-500/30' /* ds-allow-focus: identity/one-off hue or ring-0 */ },
  yellow:    { primaryBg: 'bg-amber-500',    primaryHover: 'hover:bg-amber-600',   dotActive: 'bg-amber-500',    accentText: 'text-amber-700',    haloFrom: 'from-amber-200/60',    passkeyHover: 'hover:bg-amber-50',    ring: focusRing('field', 'warning') },
  // ds-allow-raw-neutral: identity hue — staff/label color vocabulary, not chrome
  black:     { primaryBg: 'bg-slate-900',    primaryHover: 'hover:bg-slate-800',   dotActive: 'bg-slate-900',    accentText: 'text-text-default',    haloFrom: 'from-slate-300/60',    passkeyHover: 'hover:bg-surface-sunken',   ring: focusRing('field', 'neutral') },
  red:       { primaryBg: 'bg-red-600',      primaryHover: 'hover:bg-red-700',     dotActive: 'bg-red-600',      accentText: 'text-red-700',      haloFrom: 'from-red-200/60',      passkeyHover: 'hover:bg-red-50',      ring: focusRing('field', 'danger') },
  lightblue: { primaryBg: 'bg-sky-500',      primaryHover: 'hover:bg-sky-600',     dotActive: 'bg-sky-500',      accentText: 'text-sky-700',      haloFrom: 'from-sky-200/60',      passkeyHover: 'hover:bg-sky-50',      ring: focusRing('field', 'accent') },
  pink:      { primaryBg: 'bg-pink-500',     primaryHover: 'hover:bg-pink-600',    dotActive: 'bg-pink-500',     accentText: 'text-pink-700',     haloFrom: 'from-pink-200/60',     passkeyHover: 'hover:bg-pink-50',     ring: 'focus:ring-pink-500/30' /* ds-allow-focus: identity/one-off hue or ring-0 */ },
};

/** Resolve the numpad face for a staff theme. */
export function numpadTheme(theme: StationTheme): NumpadThemeFace {
  return THEME_NUMPAD[theme];
}
