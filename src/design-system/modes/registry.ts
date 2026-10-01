/** Mode registry — web face of task modes and their job looks. */
import { modeRegistryCssText, stateCodeCssText, trialCssText } from '@cycleforge/design-tokens';

export {
  MODE_LOOKS,
  MODE_NAMES,
  MODE_NEUTRAL_REMAP,
  MODE_REGISTRY,
  NEUTRAL_SURFACES,
  SLATE_SURFACES,
  modeRegistryCssText,
  type ModeLookName,
  type ModeMeasure,
  type ModeName,
  type ModeSpec,
  type ModeSurfaces,
} from '@cycleforge/design-tokens';

export const modeRegistryStyleText = `${modeRegistryCssText()}\n\n${stateCodeCssText()}\n\n${trialCssText()}`;
