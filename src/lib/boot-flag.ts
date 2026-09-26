'use client';

/** One-shot "this navigation is a fresh sign-in" flag. */
const BOOT_FLAG_KEY = 'cf:boot-splash';
const LEGACY_BOOT_FLAG_KEY = 'usav:boot-splash';

export function armBootSplash(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(BOOT_FLAG_KEY, '1');
    window.sessionStorage.removeItem(LEGACY_BOOT_FLAG_KEY);
  } catch {
    /* private mode / disabled storage — splash just won't hold, no harm */
  }
}

/** Returns true once per arm, clearing the flag so it doesn't fire again. */
export function consumeBootSplash(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const armed =
      window.sessionStorage.getItem(BOOT_FLAG_KEY) === '1' ||
      window.sessionStorage.getItem(LEGACY_BOOT_FLAG_KEY) === '1';
    if (armed) {
      window.sessionStorage.removeItem(BOOT_FLAG_KEY);
      window.sessionStorage.removeItem(LEGACY_BOOT_FLAG_KEY);
    }
    return armed;
  } catch {
    return false;
  }
}
