/** Client-side WebAuthn capability checks (no server). */

export function browserSupportsWebAuthn(): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.isSecureContext) return false;
  return typeof window.PublicKeyCredential === 'function';
}

export async function platformAuthenticatorAvailable(): Promise<boolean> {
  if (!browserSupportsWebAuthn()) return false;
  try {
    const fn = window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable;
    if (typeof fn !== 'function') return false;
    return await fn.call(window.PublicKeyCredential);
  } catch {
    return false;
  }
}

/** Map raw WebAuthn / SimpleWebAuthn errors to operator copy. */
export function humanizeWebAuthnError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const name = err instanceof Error ? err.name : '';
  if (name === 'NotAllowedError' || name === 'AbortError') {
    return 'Face ID was cancelled. Nothing changed — any other sign-in still works.';
  }
  if (name === 'SecurityError' || /not supported|secure context|PublicKeyCredential/i.test(msg)) {
    return 'Face ID needs a secure page (https:// or localhost). Scan the QR with your phone, or use email / Google.';
  }
  if (/no credentials|empty allowCredentials|NotAllowed/i.test(msg)) {
    return 'No Face ID passkey on this device yet. Enroll from an invite QR on your phone, or use another sign-in.';
  }
  return msg || 'Face ID failed. Try again or use another sign-in option.';
}
