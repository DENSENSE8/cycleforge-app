/** Map a credential-scope error to the right HTTP status at the route layer (Wave 5). */
import { CredentialPermissionError, CredentialNotConnectedError } from './credential-scope';

/** HTTP status for a credential error, or null if `err` isn't one. */
export function credentialErrorStatus(err: unknown): number | null {
  if (err instanceof CredentialPermissionError) return 403;
  if (err instanceof CredentialNotConnectedError) return 409;
  return null;
}
