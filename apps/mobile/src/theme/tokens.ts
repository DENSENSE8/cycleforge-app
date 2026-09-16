/**
 * Native equivalents for the semantic CycleForge visual roles.
 *
 * React Native cannot consume the web CSS custom properties directly. Keep the
 * mapping in one mobile-only module so screen presenters never invent their own
 * palette and the native theme can move to platform dynamic colors later.
 */
export const mobileColors = {
  canvas: '#f5f7fa',
  surface: '#ffffff',
  textPrimary: '#102a43',
  textSecondary: '#52606d',
  textSoft: '#627d98',
  textFaint: '#829ab1',
  textBody: '#334e68',
  border: '#bcccdc',
  accent: '#0b6e4f',
} as const;
