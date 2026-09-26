/** Vercel Skew Protection pin for long-lived floor / kiosk sessions. */

export const VDPL_COOKIE = '__vdpl';

/** One warehouse shift. Dashboard max-age must be ≥ this. */
export const VDPL_MAX_AGE_SEC = 12 * 60 * 60;

export type SkewPinDecision =
  | { pin: false }
  | { pin: true; deploymentId: string };

export function skewPinDecision(input: {
  skewProtectionEnabled: string | undefined;
  deploymentId: string | undefined;
  existingVdpl: string | undefined;
  hasStaffSession: boolean;
  isKioskHost: boolean;
}): SkewPinDecision {
  if (input.skewProtectionEnabled !== '1') return { pin: false };
  const deploymentId = input.deploymentId?.trim();
  if (!deploymentId) return { pin: false };
  if (input.existingVdpl) return { pin: false };
  if (!input.hasStaffSession && !input.isKioskHost) return { pin: false };
  return { pin: true, deploymentId };
}
