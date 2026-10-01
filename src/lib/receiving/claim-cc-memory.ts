/** Last CC list from the claim form. The Unbox composer reads the same key. */

export const CLAIM_CC_EMAIL_STORAGE_KEY = 'receiving-claim:cc-emails';

export function readStoredClaimCcEmails(
  storageKey: string = CLAIM_CC_EMAIL_STORAGE_KEY,
): string[] {
  let stored: string | null;
  try {
    stored = window.localStorage.getItem(storageKey);
  } catch {
    return [];
  }
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((value) => String(value ?? '').trim())
      .filter(Boolean)
      .filter((value, index, all) => all.indexOf(value) === index);
  } catch {
    const trimmed = stored.trim();
    return trimmed ? [trimmed] : [];
  }
}

export function rememberClaimCcEmails(emails: readonly string[]): void {
  const next = emails
    .map((email) => email.trim())
    .filter(Boolean)
    .filter((email, index, all) => all.indexOf(email) === index);
  try {
    const known = new Set(readStoredClaimCcEmails());
    for (const email of next) known.add(email);
    window.localStorage.setItem(CLAIM_CC_EMAIL_STORAGE_KEY, JSON.stringify([...known]));
  } catch {
    // Best-effort. A private window must not take the composer down.
  }
}
