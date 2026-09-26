/** Server-only: the directed putaway target for one receiving line. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { fetchMostRecentStagedLocation } from './recent-staged-location-server';
import {
  pickSkuHistoryWinner,
  SKU_HISTORY_SAMPLE,
  type PutawaySuggestion,
  type PutawaySuggestionLocation,
} from './suggested-putaway-location';

async function fetchLocationFace(
  orgId: OrgId,
  locationId: number,
): Promise<PutawaySuggestionLocation | null> {
  const res = await tenantQuery<PutawaySuggestionLocation>(
    orgId,
    `SELECT id, name, room, barcode, row_label, col_label,
            zone_letter, bin_type, capacity, description
       FROM locations
      WHERE id = $2 AND organization_id = $1
      LIMIT 1`,
    [orgId, locationId],
  );
  return res.rows[0] ?? null;
}

export async function fetchSuggestedPutawayLocation(
  orgId: OrgId,
  opts: { lineId: number },
): Promise<PutawaySuggestion | null> {
  const lineId = opts.lineId;
  if (!Number.isFinite(lineId) || lineId <= 0) return null;

  const lineRes = await tenantQuery<{ sku: string | null }>(
    orgId,
    `SELECT sku FROM receiving_line
      WHERE id = $2 AND organization_id = $1
      LIMIT 1`,
    [orgId, lineId],
  );
  const line = lineRes.rows[0];
  if (!line) return null;

  const sku = (line.sku || '').trim();

  if (sku) {
    // Same SKU, any carton but this line. Newest-first so the ranking's
    // recency tiebreak is a walk, not a second sort key.
    const hist = await tenantQuery<{ location_id: number }>(
      orgId,
      `SELECT rlp.staged_location_id AS location_id
         FROM receiving_line_putaway rlp
         JOIN receiving_line rl
           ON rl.id = rlp.receiving_line_id
          AND rl.organization_id = $1
        WHERE rlp.organization_id = $1
          AND rlp.staged_location_id IS NOT NULL
          AND rlp.staged_at IS NOT NULL
          AND rl.sku = $2
          AND rl.id <> $3
        ORDER BY rlp.staged_at DESC NULLS LAST, rlp.receiving_line_id DESC
        LIMIT $4`,
      [orgId, sku, lineId, SKU_HISTORY_SAMPLE],
    );
    const winner = pickSkuHistoryWinner(
      hist.rows.map((r) => ({ locationId: Number(r.location_id) })),
    );
    if (winner) {
      const location = await fetchLocationFace(orgId, winner.locationId);
      // A staged bin that has since been deleted is not a target — fall
      // through to the floor's last stage rather than pointing at a ghost.
      if (location) {
        return {
          location,
          basis: 'sku_history',
          hits: winner.hits,
          sampled: winner.sampled,
          sku,
        };
      }
    }
  }

  const recent = await fetchMostRecentStagedLocation(orgId, { excludeLineId: lineId });
  if (!recent) return null;
  const location = await fetchLocationFace(orgId, recent.locationId);
  if (!location) return null;
  return { location, basis: 'recent_stage', hits: 1, sampled: 1, sku: null };
}
