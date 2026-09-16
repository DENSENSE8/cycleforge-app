/**
 * What a FAILED `/api/admin/staff/update` write says to the operator.
 *
 * `POST /api/admin/staff/update` is itself behind the sensitive-information
 * wall (`requireSensitiveStepUp`), so any auth-policy write can come back
 * `403 STEP_UP_REQUIRED` — and that answer is not an error message, it is an
 * INSTRUCTION: re-authenticate and try again. The retired `AuthPolicyCell`
 * branched on it inline and raised `toast.warning`; losing that branch while
 * porting the editor onto a plane would turn a recoverable security prompt
 * into "Couldn't update auth policy: STEP_UP_REQUIRED", which reads as a bug
 * and leaves the admin with nothing to do about it.
 *
 * It is a pure mapping in its own module for exactly that reason: the step-up
 * path is the one behaviour of this write that a test must be able to pin
 * without mounting a plane or stubbing `fetch`.
 */

/** The API's error code for "re-authenticate before this write". */
export const STEP_UP_REQUIRED = 'STEP_UP_REQUIRED';

/**
 * The `error` code out of a failed JSON body, narrowed rather than asserted.
 *
 * `r.json().catch(() => null)` hands back `unknown`: the desk's two writes
 * (`/deactivate` and `/update`) both read this one field off it, and an
 * inline `as { error?: string }` would fabricate a shape neither response is
 * contractually obliged to have.
 */
export function apiErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) return null;
  const code = payload.error;
  return typeof code === 'string' && code ? code : null;
}

export interface StaffAuthPolicyFailure {
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
