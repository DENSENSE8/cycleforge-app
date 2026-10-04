/**
 * Carrier facts the inbound sheet used to carry by hand ("Signed for by: SANG",
 * "Delivery Attempt"), read straight off the polled shipment. Needs
 * `stn` (shipping_tracking_numbers) in scope; NULL when the line has no shipment.
 */

const FEDEX_DELIVERY_DETAILS =
  `stn.latest_payload #> '{output,completeTrackResults,0,trackResults,0,deliveryDetails}'`;
const UPS_DELIVERY_INFORMATION =
  `stn.latest_payload #> '{trackResponse,shipment,0,package,0,deliveryInformation}'`;

/** Who received the package: FedEx `deliveryDetails.receivedByName`, UPS `deliveryInformation.receivedBy`. */
export const SHIPMENT_SIGNED_BY_SQL = `COALESCE(
                  NULLIF(BTRIM(${FEDEX_DELIVERY_DETAILS} ->> 'receivedByName'), ''),
                  NULLIF(BTRIM(${UPS_DELIVERY_INFORMATION} ->> 'receivedBy'), '')
                ) AS shipment_signed_by`;

/**
 * Failed delivery attempts. FedEx reports the count (`deliveryDetails.deliveryAttempts`);
 * other carriers only narrate it, so count the warehouse-local days carrying an
 * event that says an attempt failed (UPS "receiver was not available", "We
 * missed you again", "tried to deliver", "final delivery attempt", USPS
 * "Delivery Attempted"). Days, not events: carriers re-post the same attempt.
 */
export const SHIPMENT_DELIVERY_ATTEMPTS_SQL = `CASE
                  WHEN stn.id IS NULL THEN NULL
                  WHEN (${FEDEX_DELIVERY_DETAILS} ->> 'deliveryAttempts') ~ '^[0-9]+$'
                    THEN (${FEDEX_DELIVERY_DETAILS} ->> 'deliveryAttempts')::int
                  ELSE (
                    SELECT COUNT(DISTINCT (e_att.event_occurred_at AT TIME ZONE 'America/Los_Angeles')::date)::int
                      FROM shipment_tracking_events e_att
                     WHERE e_att.shipment_id = stn.id
                       AND CONCAT_WS(' ', e_att.external_status_label, e_att.external_status_description)
                           ~* '(delivery attempt|attempted (delivery|to deliver)|tried to deliver|missed you|not available for delivery|was unsuccessful)'
                  )
                END AS shipment_delivery_attempts`;
