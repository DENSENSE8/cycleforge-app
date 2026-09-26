/** localStorage adapters for the Quick Access feature. */

import { safeRandomUUID } from '@/lib/safe-uuid';
import {
  MAX_PINS,
  type PinnedPage,
  type QuickAccessSettings,
} from './types';

import { readMigratedItem } from '@/lib/storage/migrate-key';

const SETTINGS_KEY = 'cf.quickAccess';
const LEGACY_SETTINGS_KEY = 'usav.quickAccess';

/** Same-tab broadcast so every `useQuickAccess` instance re-reads. */
export const QUICK_ACCESS_CHANGED_EVENT = 'cf.quickAccess.changed';

export const DEFAULT_SETTINGS: QuickAccessSettings = {
  version: 1,
  enabled: true,
  actions: {
    phoneHistory: true,
  },
  pinned: [],
};

let pinsPersister: ((pinned: PinnedPage[]) => void) | null = null;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private-mode — ignore */
  }
}

function emitChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(QUICK_ACCESS_CHANGED_EVENT));
}

function persistPinsToServer(pinned: PinnedPage[]): void {
  pinsPersister?.(pinned);
}

/** Register how pin mutations persist to staff_preferences (QuickAccessSync). */
export function setPinsPersister(fn: ((pinned: PinnedPage[]) => void) | null): void {
  pinsPersister = fn;
}

/**
 * Adopt a server pin list WITHOUT writing it back (hydration only).
 * Updates localStorage + broadcasts so mounted hooks re-render.
 */
export function hydratePinned(pinned: PinnedPage[] | null | undefined): void {
  if (!Array.isArray(pinned)) return;
  const sanitized = sanitizePinned(pinned);
  const current = getSettings();
  if (pinnedEqual(current.pinned, sanitized)) return;
  setSettings({ pinned: sanitized });
  emitChanged();
}

function pinnedEqual(a: PinnedPage[], b: PinnedPage[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.id !== y.id ||
      x.label !== y.label ||
      x.href !== y.href ||
      x.iconKey !== y.iconKey ||
      x.addedAt !== y.addedAt
    ) {
      return false;
    }
  }
  return true;
}

/** Drop invalid / over-cap entries before cache or server write. */
export function sanitizePinned(pinned: PinnedPage[]): PinnedPage[] {
  const out: PinnedPage[] = [];
  const seenHref = new Set<string>();
  for (const p of pinned) {
    if (!p || typeof p !== 'object') continue;
    if (typeof p.id !== 'string' || !p.id) continue;
    if (typeof p.label !== 'string' || !p.label.trim()) continue;
    if (typeof p.href !== 'string' || !p.href.startsWith('/')) continue;
    if (seenHref.has(p.href)) continue;
    seenHref.add(p.href);
    out.push({
      id: p.id.slice(0, 64),
      label: p.label.trim().slice(0, 120),
      href: p.href.slice(0, 2000),
      iconKey: typeof p.iconKey === 'string' ? p.iconKey.slice(0, 64) : undefined,
      addedAt: typeof p.addedAt === 'number' && Number.isFinite(p.addedAt) ? p.addedAt : Date.now(),
    });
    if (out.length >= MAX_PINS) break;
  }
  return out;
}

export function getSettings(): QuickAccessSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  const raw = readMigratedItem(window.localStorage, SETTINGS_KEY, LEGACY_SETTINGS_KEY);
  const parsed = safeParse<
    Partial<QuickAccessSettings> & { showRecent?: boolean; hotkey?: string }
  >(raw, {});
  // Drop legacy FAB-recents flag, and the retired `hotkey` claim on ⌘K — the
  // palette owns that chord now (see QuickAccessSettings' docblock).
  const { showRecent: _legacyShowRecent, hotkey: _retiredHotkey, ...rest } = parsed;
  return {
    ...DEFAULT_SETTINGS,
    ...rest,
    version: 1,
    actions: { ...DEFAULT_SETTINGS.actions, ...(rest.actions ?? {}) },
    pinned: Array.isArray(rest.pinned) ? sanitizePinned(rest.pinned) : [],
  };
}

export function setSettings(patch: Partial<QuickAccessSettings>): QuickAccessSettings {
  const current = getSettings();
  const next: QuickAccessSettings = {
    ...current,
    ...patch,
    version: 1,
    actions: { ...current.actions, ...(patch.actions ?? {}) },
    pinned: Array.isArray(patch.pinned) ? sanitizePinned(patch.pinned) : current.pinned,
  };
  safeWrite(SETTINGS_KEY, next);
  return next;
}

function makeId(): string {
  return safeRandomUUID();
}

export function isPinned(href: string): boolean {
  return getSettings().pinned.some((p) => p.href === href);
}

export function findPinByHref(href: string): PinnedPage | null {
  return getSettings().pinned.find((p) => p.href === href) ?? null;
}

export function addPin(input: {
  label: string;
  href: string;
  iconKey?: string;
}): { settings: QuickAccessSettings; result: 'added' | 'duplicate' | 'full' } {
  const current = getSettings();
  if (current.pinned.some((p) => p.href === input.href)) {
    return { settings: current, result: 'duplicate' };
  }
  if (current.pinned.length >= MAX_PINS) {
    return { settings: current, result: 'full' };
  }
  const pin: PinnedPage = {
    id: makeId(),
    label: input.label.trim() || input.href,
    href: input.href,
    iconKey: input.iconKey,
    addedAt: Date.now(),
  };
  const settings = setSettings({ pinned: [pin, ...current.pinned] });
  persistPinsToServer(settings.pinned);
  return { settings, result: 'added' };
}

export function removePin(id: string): QuickAccessSettings {
  const current = getSettings();
  const settings = setSettings({ pinned: current.pinned.filter((p) => p.id !== id) });
  persistPinsToServer(settings.pinned);
  return settings;
}

export function renamePin(id: string, label: string): QuickAccessSettings {
  const current = getSettings();
  const settings = setSettings({
    pinned: current.pinned.map((p) => (p.id === id ? { ...p, label: label.trim() || p.label } : p)),
  });
  persistPinsToServer(settings.pinned);
  return settings;
}

export function reorderPins(orderedIds: string[]): QuickAccessSettings {
  const current = getSettings();
  const map = new Map(current.pinned.map((p) => [p.id, p]));
  const reordered: PinnedPage[] = [];
  for (const id of orderedIds) {
    const pin = map.get(id);
    if (pin) {
      reordered.push(pin);
      map.delete(id);
    }
  }
  // Append any pins that weren't in the orderedIds list (defensive)
  for (const remaining of map.values()) reordered.push(remaining);
  const settings = setSettings({ pinned: reordered });
  persistPinsToServer(settings.pinned);
  return settings;
}
