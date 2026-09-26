/** Mode registry — web face of the four TASK modes. */
import { modeRegistryCssText, stateCodeCssText, trialCssText } from '@cycleforge/design-tokens';

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

export const modeRegistryStyleText = `${modeRegistryCssText()}\n\n${stateCodeCssText()}\n\n${trialCssText()}`;
