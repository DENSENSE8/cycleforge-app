/**
 * Mode registry — web face of the four TASK modes. The values and the CSS
 * generator live in the cross-platform token registry
 * (`packages/design-tokens/src/modes.ts`), the one copy web, desktop and iOS
 * all read; read that module for what each mode is and what the stylesheet
 * does.
 *
 * app/layout.tsx injects `modeRegistryStyleText` as
 * `<style id="app-mode-registry">`, directly after the theme palettes.
 */
import { modeRegistryCssText } from '@cycleforge/design-tokens';

export {
  MODE_NAMES,
  MODE_NEUTRAL_REMAP,
  MODE_REGISTRY,
  SLATE_SURFACES,
  WARM_SURFACES,
  OPERATIONAL_BASE,
  OPERATIONAL_MODES,
  DENSITY_KEYS,
  IDENTITY_EXEMPT_MODES,
  modeRegistryCssText,
  type ModeMeasure,
  type ModeName,
  type ModeSpec,
  type ModeSurfaces,
} from '@cycleforge/design-tokens';

export const modeRegistryStyleText = modeRegistryCssText();
