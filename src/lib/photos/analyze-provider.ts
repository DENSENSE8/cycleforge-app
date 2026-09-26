/** Per-org photo-analysis provider resolution (pure, DB-free). */

import type { PhotoAnalysisSettings } from '@/lib/tenancy/settings';

/** The canonical provider vocabulary. `gcp-vision` = Google Cloud Vision (cloud). */
export type PhotoAnalyzeProvider = 'hermes' | 'gcp-vision' | 'local-vision' | 'catalog';

export const PHOTO_ANALYZE_PROVIDERS: readonly PhotoAnalyzeProvider[] = [
  'local-vision',
  'hermes',
  'gcp-vision',
  'catalog',
] as const;

/** Local-first: when nothing is configured anywhere, keep photos on the org's box. */
export const DEFAULT_PHOTO_ANALYZE_PROVIDER: PhotoAnalyzeProvider = 'local-vision';

/**
 * Coerce a raw string (UI value or env var) to a known provider, or null when it
 * isn't one. Accepts the legacy `'vision'` alias for `'gcp-vision'` so existing
 * PHOTOS_ANALYZE_PROVIDER=vision deployments keep meaning Google Cloud Vision.
 */
export function normalizeProvider(raw: string | null | undefined): PhotoAnalyzeProvider | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === '') return null;
  if (v === 'vision' || v === 'gcp' || v === 'gcp-vision' || v === 'google') return 'gcp-vision';
  if (v === 'local' || v === 'local-vision' || v === 'vision-box') return 'local-vision';
  if (v === 'hermes') return 'hermes';
  if (v === 'catalog' || v === 'off' || v === 'none') return 'catalog';
  return null;
}

/**
 * Resolve which provider should run for this org. `orgSettings` is the parsed
 * `photoAnalysis` block (or undefined); `envProvider` is the raw
 * PHOTOS_ANALYZE_PROVIDER value.
 */
export function resolvePhotoAnalyzeProvider(
  orgSettings: PhotoAnalysisSettings | undefined,
  envProvider: string | null | undefined,
): PhotoAnalyzeProvider {
  const fromOrg = normalizeProvider(orgSettings?.provider);
  if (fromOrg) return fromOrg;
  const fromEnv = normalizeProvider(envProvider);
  if (fromEnv) return fromEnv;
  return DEFAULT_PHOTO_ANALYZE_PROVIDER;
}

/**
 * Resolve whether analysis is enabled for this org. The per-org `enabled` flag
 * wins when set; otherwise the deployment-wide env switch decides.
 */
export function resolvePhotoAnalyzeEnabled(
  orgSettings: PhotoAnalysisSettings | undefined,
  envEnabled: boolean,
): boolean {
  if (typeof orgSettings?.enabled === 'boolean') return orgSettings.enabled;
  return envEnabled;
}
