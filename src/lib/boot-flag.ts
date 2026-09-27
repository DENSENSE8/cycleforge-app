'use client';

import type { WelcomeTheme } from '@/components/boot/welcome/welcome-theme';

/** One-shot "this navigation is a fresh sign-in" flag. */
const BOOT_FLAG_KEY = 'cf:boot-splash';
const LEGACY_BOOT_FLAG_KEY = 'usav:boot-splash';
/** The staffer being signed in; read by BOOT_SPLASH_SCRIPT's pre-hydration bridge. */
const WELCOME_STAFF_KEY = 'cf:welcome-staff';
/** Dev-only query param forcing a welcome theme (resolveWelcomeTheme ignores it in production). */
const WELCOME_THEME_PARAM = 'welcomeTheme';
/**
 * Window event: play the welcome NOW, in place (no navigation) — e.g. a staff
 * switch that swaps identity without a reload. Dispatch after `armBootSplash`
 * wrote the new staffer's stash; the shell host consumes the flag and plays.
 */
export const WELCOME_PLAY_EVENT = 'cf:welcome-play';

/** `cf:welcome-staff` payload. `avatarUrl` is a same-origin relative photo URL, present only when the staffer has a photo. */
export interface WelcomeStaff {
  name: string;
  colorHex: string;
  avatarUrl?: string;
  initials: string;
  /** Welcome theme resolved at sign-in, so the static twins paint the same lobby the overlay plays. */
  themeId: WelcomeTheme['id'];
}

/** `?welcomeTheme=` on the current URL (dev override for resolveWelcomeTheme), or null. */
export function readWelcomeThemeOverride(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(WELCOME_THEME_PARAM);
}

export function armBootSplash(staff?: WelcomeStaff): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(BOOT_FLAG_KEY, '1');
    window.sessionStorage.removeItem(LEGACY_BOOT_FLAG_KEY);
    if (staff) window.sessionStorage.setItem(WELCOME_STAFF_KEY, JSON.stringify(staff));
    else window.sessionStorage.removeItem(WELCOME_STAFF_KEY);
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
