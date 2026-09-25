/**
 * Shared SQL fragment for detecting whether a shipment has been accepted by a carrier.
 * Requires the calling query to alias `shipping_tracking_numbers` as `stn`.
 */
export const SHIPPED_BY_CARRIER_SQL = `COALESCE(
  stn.is_carrier_accepted
  OR stn.is_in_transit
  OR stn.is_out_for_delivery
  OR stn.is_delivered
  OR (
    COALESCE(BTRIM(stn.latest_status_category), '') <> ''
    AND UPPER(BTRIM(stn.latest_status_category)) NOT IN ('LABEL_CREATED', 'UNKNOWN')
  )
  OR UPPER(COALESCE(stn.latest_status_label, '')) LIKE '%MOVING THROUGH NETWORK%'
  OR UPPER(COALESCE(stn.latest_status_description, '')) LIKE '%MOVING THROUGH NETWORK%',
  false
)`;

/**
 * Bins a unit must never be picked from.
 *
 * Staging and dock are outbound-committed, receiving is not put away yet, and
 * quarantine / damaged / returns are not sellable. A unit in one of these is
 * not supply.
 *
 * Read by the allocator's `selectSupply` (src/lib/allocation/auto-allocate.ts),
 * which decides what it may reserve. Any surface that promises a picker stock
 * must read this same list — a second copy is how a phone comes to promise
 * stock the allocator refuses.
 *
 * Formatted as a parenthesised SQL list for direct `IN` interpolation.
 */
export const NON_PICKABLE_BIN_ROLES =
  "('STAGING','DOCK','QUARANTINE','DAMAGED','RETURNS','RECEIVING')";
