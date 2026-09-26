import { LIGHT_THEME } from '@cycleforge/design-tokens';
import type { ThemePalette } from './registry';

/** Light — the default theme. */
export const lightPalette: ThemePalette = {
  name: 'light',
  label: 'Light',
  hint: 'Bright — the default.',
  scheme: 'light',
  preview: { canvas: '#fafafa', card: '#ffffff', accent: '#2563eb', text: '#0f172a' },
  page: LIGHT_THEME.page,
  vars: LIGHT_THEME.vars,
};
