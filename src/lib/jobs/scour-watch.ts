import { scour } from '@/lib/sourcing/search';
import { getDueSourcingSearches, markSourcingSearchRun } from '@/lib/neon/sourcing-searches-queries';
import type { CandidateSource } from '@/lib/sourcing/normalize';
import type { BrowseCondition } from '@/lib/ebay/browse-client';
import type { OrgId } from '@/lib/tenancy/constants';

/** Scour watcher — the active half of standing searches (Sourcing Hub §4.3). */

interface ScourWatchResult {
  checked: number;
  withHits: number;
  candidatesSaved: number;
}

/** Run the scour watcher for ONE org (or the legacy global pass when `orgId` is omitted). */
export async function runScourWatch(orgId?: OrgId): Promise<ScourWatchResult> {
  const due = await getDueSourcingSearches(orgId);
  let withHits = 0;
  let candidatesSaved = 0;

  for (const s of due) {
    try {
      const { results, saved } = await scour({
        query: s.query,
        skuId: s.sku_id,
        sourcingAlertId: s.sourcing_alert_id,
        conditions: (s.conditions ?? undefined) as BrowseCondition[] | undefined,
        maxPriceCents: s.max_price_cents,
        sources: (s.sources ?? undefined) as CandidateSource[] | undefined,
        limit: 20,
        save: true,
        orgId,
      });
      candidatesSaved += saved;
      if (results.length) withHits += 1;
      await markSourcingSearchRun(s.id, results.length, orgId);
    } catch (err) {
      // Leave last_run_at untouched so the next tick retries.
      console.warn('[scour.watch] failed for search', s.id, err instanceof Error ? err.message : err);
    }
  }

  return { checked: due.length, withHits, candidatesSaved };
}
