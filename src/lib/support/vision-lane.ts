/** Which lane may look at a customer's photo — a SAFETY CLASSIFICATION, resolved per org, local-first. */

/** The lane vocabulary. `local-only` never sends an image anywhere. */
export type SupportVisionLane = 'local-only' | 'cloud-multimodal';

/** Local-first: with nothing configured anywhere, no image leaves the tenant. */
const DEFAULT_SUPPORT_VISION_LANE: SupportVisionLane = 'local-only';

/** Coerce a raw string (UI value or env var) to a lane, or null when it is not one. */
export function normalizeVisionLane(raw: string | null | undefined): SupportVisionLane | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v === 'local' || v === 'local-only' || v === 'off' || v === 'none') return 'local-only';
  if (v === 'cloud' || v === 'cloud-multimodal' || v === 'multimodal') return 'cloud-multimodal';
  return null;
}

export function resolveSupportVisionLane(input: {
  /** `organizations.settings.support.visionLane`, already parsed. */
  orgLane: string | null | undefined;
  /** The raw SUPPORT_VISION_LANE value. */
  envLane: string | null | undefined;
  /** Whether a multimodal-capable chat provider is actually configured. */
  cloudAvailable: boolean;
}): SupportVisionLane {
  const requested =
    normalizeVisionLane(input.orgLane) ??
    normalizeVisionLane(input.envLane) ??
    DEFAULT_SUPPORT_VISION_LANE;
  if (requested === 'cloud-multimodal' && !input.cloudAvailable) return 'local-only';
  return requested;
}
