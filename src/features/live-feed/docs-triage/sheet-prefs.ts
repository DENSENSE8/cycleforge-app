/**
 * The docs sheet remembers, per staffer on this browser, whether the order
 * rail was folded and the tab last open (operator 2026-10-06). Storage that
 * is missing, full, blocked or holding garbage reads as the defaults and
 * never throws.
 */

import { DOC_TABS, type DocTab } from './doc-tabs';

export interface SheetPrefs {
  railFolded: boolean;
  /** The tab last open; null = never opened here. */
  tab: DocTab | null;
}

export const DEFAULT_SHEET_PREFS: SheetPrefs = { railFolded: false, tab: null };

const KEY_PREFIX = 'cf.live-feed.docs-sheet.v1:';

export function parseSheetPrefs(raw: string | null): SheetPrefs {
  if (!raw) return DEFAULT_SHEET_PREFS;
  try {
    const value = JSON.parse(raw) as Partial<Record<keyof SheetPrefs, unknown>> | null;
    return {
      railFolded: value?.railFolded === true,
      tab: DOC_TABS.find((tab) => tab === value?.tab) ?? null,
    };
  } catch {
    return DEFAULT_SHEET_PREFS;
  }
}

export function readSheetPrefs(staffId: number | null | undefined): SheetPrefs {
  if (staffId == null || typeof window === 'undefined') return DEFAULT_SHEET_PREFS;
  try {
    return parseSheetPrefs(window.localStorage.getItem(`${KEY_PREFIX}${staffId}`));
  } catch {
    return DEFAULT_SHEET_PREFS;
  }
}

export function writeSheetPrefs(staffId: number | null | undefined, prefs: SheetPrefs): void {
  if (staffId == null || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${staffId}`, JSON.stringify(prefs));
  } catch {
    // Private mode / quota: the sheet still works, it just does not remember.
  }
}
