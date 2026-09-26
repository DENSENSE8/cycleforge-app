import 'server-only';
import { routeScan } from '@/lib/barcode-routing';
import { analyzePhoto } from '@/lib/photos/analyze';
import type { PhotoAnalysisMetadata } from '@/lib/photos/analyze-types';
import { hybridSearch } from '@/lib/search/hybrid-retrieval';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import type { PhotoEvidenceDeps } from './photo-evidence';

/** Rows per identifier. An OCR'd handle should resolve to one thing, not a page. */
const HITS_PER_TOKEN = 3;

/** Server bindings for {@link PhotoEvidenceDeps} — the real analyzer, the one decoder, and the one search engine. */
export function supportPhotoEvidenceDeps(orgId: OrgId): PhotoEvidenceDeps {
  return {
    async analyze(photoId: number): Promise<PhotoAnalysisMetadata | null> {
      const { rows } = await tenantQuery<{ metadata: unknown }>(
        orgId,
        `SELECT a.metadata
           FROM photo_analysis a
           JOIN photos p ON p.id = a.photo_id
          WHERE a.photo_id = $1 AND p.organization_id = $2
          LIMIT 1`,
        [photoId, orgId],
      );
      const existing = rows[0]?.metadata;
      if (existing && typeof existing === 'object') return existing as PhotoAnalysisMetadata;

      // No enrichment yet (the common case for a photo pasted seconds ago).
      // A provider that is down degrades to deterministic catalog metadata
      // inside analyzePhoto; only a missing photo throws.
      try {
        return await analyzePhoto({ photoId, organizationId: orgId });
      } catch {
        return null;
      }
    },

    decode: (raw) => {
      const route = routeScan(raw);
      return route ? { type: route.type, value: route.value } : null;
    },

    search: async (query) => {
      const { hits } = await hybridSearch(orgId, query, { limit: HITS_PER_TOKEN });
      return hits;
    },
  };
}
