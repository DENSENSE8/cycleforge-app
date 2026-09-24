import { LIGHT_THEME } from '@cycleforge/design-tokens';
import type { ThemePalette } from './registry';

/**
 * Light — the default theme. Its `vars` and `page` values live in the
 * cross-platform token registry (`packages/design-tokens/src/light.ts`), the
 * one copy web, desktop and iOS all read; the page-plane ruling and its pin
 * are documented there, at the value.
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
  page: LIGHT_THEME.page,
  vars: LIGHT_THEME.vars,
};
