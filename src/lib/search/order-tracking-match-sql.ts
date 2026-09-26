/** Order ↔ tracking match SQL — shared by header find (`searchOrders`) and identifier paste (`findOrderByTrackingKey`). */

/** True when this order row owns the given STN id (primary cache or shipment_links). */
export function sqlOrderOwnsShipment(orderAlias: string, shipmentIdExpr: string): string {
  return `(
    ${orderAlias}.shipment_id = ${shipmentIdExpr}
    OR EXISTS (
      SELECT 1
      FROM shipment_links sl_trk
      WHERE sl_trk.owner_type = 'ORDER'
        AND sl_trk.owner_id = ${orderAlias}.id
        AND sl_trk.shipment_id = ${shipmentIdExpr}
        AND sl_trk.organization_id = ${orderAlias}.organization_id
    )
  )`;
}

/** True when this STN row matches the operator query (raw / canonical / key18 / last-8). */
export function sqlTrackingNumberMatches(args: {
  stnAlias: string;
  likeParam: string;
  canonicalParam: string;
  key18Param: string;
  last8Param: string;
}): string {
  const s = args.stnAlias;
  return `(
    ${s}.tracking_number_raw ILIKE ${args.likeParam}
    OR ${s}.tracking_number_normalized = ${args.canonicalParam}
    OR (
      ${args.key18Param} <> ''
      AND RIGHT(regexp_replace(UPPER(COALESCE(${s}.tracking_number_normalized, '')), '[^A-Z0-9]', '', 'g'), 18) = ${args.key18Param}
    )
    OR (
      ${args.last8Param} <> ''
      AND RIGHT(regexp_replace(COALESCE(${s}.tracking_number_normalized, ''), '[^0-9]', '', 'g'), 8) = ${args.last8Param}
    )
  )`;
}

/**
 * EXISTS: this order is linked (primary or shipment_links) to an STN matching
 * the query. Independent of the SELECT's display join.
 */
export function sqlOrderHasMatchingTracking(args: {
  orderAlias: string;
  likeParam: string;
  canonicalParam: string;
  key18Param: string;
  last8Param: string;
}): string {
  const stn = 'stn_trk';
  return `EXISTS (
    SELECT 1
    FROM shipping_tracking_numbers ${stn}
    WHERE ${sqlOrderOwnsShipment(args.orderAlias, `${stn}.id`)}
      AND ${sqlTrackingNumberMatches({
        stnAlias: stn,
        likeParam: args.likeParam,
        canonicalParam: args.canonicalParam,
        key18Param: args.key18Param,
        last8Param: args.last8Param,
      })}
  )`;
}
