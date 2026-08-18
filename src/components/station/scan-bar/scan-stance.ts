'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Left-icon stance on the station scan bar.
 *
 * Distinct from right-rail *type* (Ticket / Tracking / PO / …) and from Auto
 * (`armedMode === null`). Scan commits on Enter; Preview decodes only.
 *
 * Session + localStorage (not staff_preferences) — prefs plumbing is a later
 * pass if we want this cross-device.
 */
export type StationScanStance = 'scan' | 'preview';

const STORAGE_KEY = 'scan:station-stance';
const DEFAULT_STANCE: StationScanStance = 'scan';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function isStance(value: string | null): value is StationScanStance {
  return value === 'scan' || value === 'preview';
}

function readStored(): StationScanStance {
  if (!isBrowser()) return DEFAULT_STANCE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isStance(raw) ? raw : DEFAULT_STANCE;
  } catch {
    return DEFAULT_STANCE;
  }
}

let stance: StationScanStance = readStored();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function writeStored(next: StationScanStance): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* in-memory still works for the session */
  }
}

export function getScanStance(): StationScanStance {
  return stance;
}

export function isScanPreview(): boolean {
  return stance === 'preview';
}

export function setScanStance(next: StationScanStance): void {
  if (next === stance) return;
  stance = next;
  writeStored(next);
  emit();
}

export function toggleScanStance(): StationScanStance {
  const next: StationScanStance = stance === 'scan' ? 'preview' : 'scan';
  setScanStance(next);
  return next;
}

function subscribeScanStance(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Live stance. Re-renders when any bar toggles it. */
export function useScanStance(): StationScanStance {
  return useSyncExternalStore(subscribeScanStance, getScanStance, getScanStance);
}

export function useToggleScanStance(): () => void {
  return useCallback(() => {
    toggleScanStance();
  }, []);
}
