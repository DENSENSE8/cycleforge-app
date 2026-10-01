/** Vercel Skew Protection pin for long-lived kiosk sessions. */

export const VDPL_COOKIE = '__vdpl';

/** One kiosk shift. Vercel's Skew Protection max-age must be at least this. */
export const VDPL_MAX_AGE_SEC = 12 * 60 * 60;

type SkewPinDecision =
  | { pin: false }
  | { pin: true; deploymentId: string };

export function skewPinDecision(input: {
  skewProtectionEnabled: string | undefined;
  deploymentId: string | undefined;
  existingVdpl: string | undefined;
  isKioskHost: boolean;
}): SkewPinDecision {
  if (input.skewProtectionEnabled !== '1') return { pin: false };
  // A staff workspace must follow the current production deployment. `__vdpl`
  // is host-only, so pinning staff sessions allowed app.cycleforge.ai and
  // usav.app.cycleforge.ai to run different builds for an entire shift. That
  // presented as missing Room facets and older Fulfillment sidebar options.
  if (!input.isKioskHost) return { pin: false };
  const deploymentId = input.deploymentId?.trim();
  if (!deploymentId) return { pin: false };
  if (input.existingVdpl) return { pin: false };
  return { pin: true, deploymentId };
}
