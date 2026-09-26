/**
 * What a FAILED `/api/admin/staff/update` write says to the operator.
 * porting the editor onto a plane would turn a recoverable security prompt
 */

/** The API's error code for "re-authenticate before this write". */
export const STEP_UP_REQUIRED = 'STEP_UP_REQUIRED';

/** The `error` code out of a failed JSON body, narrowed rather than asserted. */
export function apiErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) return null;
  const code = payload.error;
  return typeof code === 'string' && code ? code : null;
}

interface StaffAuthPolicyFailure {
  /** `warning` is recoverable-by-the-operator; `error` is not. */
  tone: 'warning' | 'error';
  message: string;
}

/**
 * Map a failed response onto the toast the desk raises.
 *
 * @param error `data.error` from the JSON body, when the body parsed.
 * @param status the HTTP status, used when the body said nothing useful.
 */
export function staffAuthPolicyFailure(
  error: string | null | undefined,
  status: number,
): StaffAuthPolicyFailure {
  if (error === STEP_UP_REQUIRED) {
    return {
      tone: 'warning',
      message:
        'This change needs step-up verification. Re-authenticate (PIN/passkey) and try again.',
    };
  }
  return { tone: 'error', message: `Couldn't update auth policy: ${error || status}` };
}
