'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addPin,
  DEFAULT_SETTINGS,
  getSettings,
  isPinned,
  QUICK_ACCESS_CHANGED_EVENT,
  removePin,
  renamePin,
  reorderPins,
  setSettings,
} from './storage';
import type {
  PinnedPage,
  QuickAccessSettings,
} from './types';

function emitChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(QUICK_ACCESS_CHANGED_EVENT));
}

/** React hook for Quick Access state. */
export function useQuickAccess() {
  // Server rendering cannot see localStorage.
  const [settings, setSettingsState] = useState<QuickAccessSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const sync = () => {
      setSettingsState(getSettings());
    };
    sync();
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

  const pin = useCallback((input: { label: string; href: string; iconKey?: string }) => {
    const { settings: next, result } = addPin(input);
    setSettingsState(next);
    emitChanged();
    return result;
  }, []);

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
    unpin,
    rename,
    reorder,
  };
}
