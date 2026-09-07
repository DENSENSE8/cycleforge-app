'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addPin,
  getSettings,
  insertPin,
  isPinned,
  QUICK_ACCESS_CHANGED_EVENT,
  removePin,
  renamePin,
  reorderPins,
  setSettings,
} from './storage';
import type {
  PinInput,
  PinnedPage,
  QuickAccessSettings,
} from './types';

function emitChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(QUICK_ACCESS_CHANGED_EVENT));
}

/**
 * React hook for Quick Access state. Reads from localStorage, subscribes to
 * cross-component change events, and returns mutation helpers. Pin mutations
 * also persist to `staff_preferences` via the registered persister
 * (`<QuickAccessSync/>`).
 */
export function useQuickAccess() {
  const [settings, setSettingsState] = useState<QuickAccessSettings>(() => getSettings());

  useEffect(() => {
    const sync = () => {
      setSettingsState(getSettings());
    };
    window.addEventListener(QUICK_ACCESS_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(QUICK_ACCESS_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<QuickAccessSettings>) => {
    setSettingsState(setSettings(patch));
    emitChanged();
  }, []);

  // Both writes take the discriminated {@link PinInput}: `kind` is what stops a
  // partial copy of a stored pin (which drops `sessionId`) from type-checking.
  // `kind` is a compile-time discriminant only — storage persists the fields.
  const pin = useCallback((input: PinInput) => {
    const { kind: _kind, ...fields } = input;
    const { settings: next, result } = addPin(fields);
    setSettingsState(next);
    emitChanged();
    return result;
  }, []);

  const pinAt = useCallback(
    (input: PinInput, atIndex?: number) => {
      const { kind: _kind, ...fields } = input;
      const { settings: next, result } = insertPin(fields, atIndex);
      setSettingsState(next);
      emitChanged();
      return result;
    },
    [],
  );

  const unpin = useCallback((id: string) => {
    setSettingsState(removePin(id));
    emitChanged();
  }, []);

  const rename = useCallback((id: string, label: string) => {
    setSettingsState(renamePin(id, label));
    emitChanged();
  }, []);

  const reorder = useCallback((orderedIds: string[]) => {
    setSettingsState(reorderPins(orderedIds));
    emitChanged();
  }, []);

  return {
    settings,
    pinnedByHref: (href: string): PinnedPage | null =>
      settings.pinned.find((p) => p.href === href) ?? null,
    isHrefPinned: (href: string) => settings.pinned.some((p) => p.href === href),
    isPinnedSync: isPinned,
    updateSettings,
    pin,
    pinAt,
    unpin,
    rename,
    reorder,
  };
}
