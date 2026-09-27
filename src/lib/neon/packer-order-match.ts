/**
 * The order a packer / scan-out `station_activity_logs sal` row belongs to — one
 * LATERAL shared by every packer-log read. Needs `sal` and
 * `stn` (= shipping_tracking_numbers on sal.shipment_id) in scope.
 *
 * Precedence: an ORDER shipment_link on the row's shipment, then an order whose
 * own shipment is that shipment, then an order whose tracking ends in the same
 * 18 alphanumerics (the USPS `420<zip>` prefix case). Primary links first, then
 * newest order.
 *
 * Written as three UNION ALL arms, not one OR: the OR form made the planner walk
 * every order × tracking row per scan (93 s unbounded at 43.7k SAL rows,
 * 2026-09-27). Each arm here is an index probe — `idx_shipment_links_org_shipment`,
 * `idx_orders_shipment_id`, and `idx_stn_tracking_raw_key18` on the exact
 * key18 expression below (2026-09-27d_stn_tracking_raw_key18_index.sql).
 *
 * `guard` is repeated inside every arm, not on the join's ON clause: a
 * lateral's ON filters after the subquery ran, so only an in-arm guard skips it.
 */
export function sqlPackerOrderMatchLateral(alias: string, guard = 'TRUE'): string {
  return `LEFT JOIN LATERAL (
        SELECT m.id
        FROM (
            SELECT osl.owner_id AS id, 0 AS rank, COALESCE(osl.is_primary, false) AS is_primary
            FROM shipment_links osl
            WHERE ${guard}
              AND sal.shipment_id IS NOT NULL
              AND osl.organization_id = sal.organization_id
              AND osl.shipment_id = sal.shipment_id
              AND osl.owner_type = 'ORDER'
            UNION ALL
            SELECT ord.id, 1, false
            FROM orders ord
            WHERE ${guard}
              AND sal.shipment_id IS NOT NULL
              AND ord.shipment_id = sal.shipment_id
              AND ord.organization_id = sal.organization_id
            UNION ALL
            SELECT ord.id, 2, false
            FROM shipping_tracking_numbers ord_stn
            JOIN orders ord ON ord.shipment_id = ord_stn.id AND ord.organization_id = sal.organization_id
            WHERE ${guard}
              AND COALESCE(stn.tracking_number_raw, sal.scan_ref, '') <> ''
              AND ord_stn.tracking_number_raw <> ''
              AND RIGHT(regexp_replace(UPPER(ord_stn.tracking_number_raw), '[^A-Z0-9]', '', 'g'), 18) =
                  RIGHT(regexp_replace(UPPER(COALESCE(stn.tracking_number_raw, sal.scan_ref, '')), '[^A-Z0-9]', '', 'g'), 18)
        ) m
        JOIN orders mo ON mo.id = m.id AND mo.organization_id = sal.organization_id
        ORDER BY m.rank, CASE WHEN m.is_primary THEN 0 ELSE 1 END, mo.created_at DESC NULLS LAST, mo.id DESC
        LIMIT 1
    ) ${alias}`;
}
