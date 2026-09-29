/**
 * A lane can start before carrier secrets are provisioned. Those failures are
 * normally placed under exponential backoff; once the matching credentials
 * exist, make only that exact configuration failure immediately eligible so a
 * restart heals the backlog instead of waiting up to 24 hours.
 */
export function shippingCredentialRecoveryPredicate(credentials: {
  ups: boolean;
  fedex: boolean;
}): string | null {
  const recoverable: string[] = [];
  if (credentials.ups) {
    recoverable.push(`(upper(carrier) = 'UPS'
      AND last_error_code = 'SYNC_ERROR'
      AND last_error_message = 'UPS_CLIENT_ID and UPS_CLIENT_SECRET are required')`);
  }
  if (credentials.fedex) {
    recoverable.push(`(upper(carrier) = 'FEDEX'
      AND last_error_code = 'SYNC_ERROR'
      AND last_error_message = 'FEDEX_CLIENT_ID and FEDEX_CLIENT_SECRET are required')`);
  }
  return recoverable.length > 0 ? `(${recoverable.join(' OR ')})` : null;
}
