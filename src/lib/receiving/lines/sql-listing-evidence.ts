import { RECEIVING_PHOTO_LISTING } from '@/lib/receiving/photo-intent';

/**
 * What the purchase listing said about a line, for unbox's "As listed"
 * block (2026-10-06_inbound_listing_evidence.sql; written by
 * `ingestInboundOrderInTx`): the listing's serials as a JSON array
 * `[{ id, serial, first_seen_at, confirmed_at }]` (first seen first), and the
 * ids of the line's listing photos (`photo_type = 'listing'`, oldest first —
 * content at `/api/photos/<id>/content`). The bought-as grade rides `rl.*`
 * (`receiving_line.purchase_condition_grade`). Needs `rl` in scope.
 */
export const RECEIVING_LINE_LISTING_EVIDENCE_SQL = `(SELECT COALESCE(jsonb_agg(jsonb_build_object(
                           'id', ls.id, 'serial', ls.serial,
                           'first_seen_at', ls.first_seen_at, 'confirmed_at', ls.confirmed_at
                         ) ORDER BY ls.first_seen_at, ls.id), '[]'::jsonb)
                   FROM receiving_line_listing_serial ls
                  WHERE ls.organization_id = rl.organization_id AND ls.receiving_line_id = rl.id) AS listing_serials,
                (SELECT COALESCE(jsonb_agg(lp.id ORDER BY lp.id), '[]'::jsonb)
                   FROM photos lp
                   JOIN photo_entity_links lpl
                     ON lpl.photo_id = lp.id AND lpl.organization_id = lp.organization_id
                    AND lpl.entity_type = 'RECEIVING_LINE' AND lpl.entity_id = rl.id AND lpl.link_role = 'primary'
                  WHERE lp.organization_id = rl.organization_id
                    AND lp.photo_type = '${RECEIVING_PHOTO_LISTING}') AS listing_photo_ids`;
