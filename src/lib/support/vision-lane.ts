/**
 * Which lane may look at a customer's photo — a SAFETY CLASSIFICATION, resolved
 * per org, local-first.
 *
 * Routing a customer's image to a cloud model is a decision about whether the
 * tenant's data leaves their hardware, so per `backend-patterns.md` it is a
 * **required parameter with no default** everywhere it is passed. A default is a
 * silent opt-out that every call site nobody visited takes automatically, and
 * the compiler stays quiet about exactly the sites that were missed.
 *
 * Precedence mirrors `resolvePhotoAnalyzeProvider` exactly — one shape for
 * "which engine serves this org", so nobody has to learn a second one:
 *
 *   1. the org's explicit setting  (`organizations.settings.support.visionLane`)
 *   2. the SUPPORT_VISION_LANE env  (deployment-wide default)
 *   3. `'local-only'`               (the LOCAL-FIRST product default)
 *
 * **`cloud-multimodal` is a request, not a guarantee.** The org can ask for it
 * and still get `local-only` when the chat capability is unconfigured — the loop
 * degrades to text-only over the deterministic OCR / labels rather than failing.
 * That is why {@link resolveSupportVisionLane} takes `cloudAvailable`: a setting
 * that cannot be honoured must not be reported to the operator as the lane that
 * ran.
 *
 * Pure and DB-free; `vision-lane-deps.ts` reads the org row.
 */

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
