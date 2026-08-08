/**
 * Time-format preference — a tiny framework-agnostic store that decides whether
 * the app renders clock times as 12-hour (h:mm AM/PM) or 24-hour (HH:mm).
 *
 * Modeled on scan-hotkey/store.ts (and the theme module): the value is
 *   1. Hydrated SYNCHRONOUSLY from localStorage so the very first render already
 *      shows the user's format with no 12h→24h flash.
 *   2. Reconciled from the server (staff_preferences) in the background by
 *      <TimeFormatSync/> — the durable cross-device SoT.
 *
 * The display formatters in src/utils/date.ts read `getTimeFormat()` as their
 * default `hour12` resolution, so every existing timestamp call site becomes
 * format-aware with no per-call-site change. Storage/API timestamp formats
 * (formatPSTTimestamp, normalizePSTTimestamp, formatApiInstant, …) are NOT
 * affected — this is a display concern only.
 *
 * Pure module, no React imports — consumed via useTimeFormat() (useSyncExternalStore).
 */

import { DEFAULT_TIME_FORMAT, TIME_FORMAT_VALUES, type TimeFormat } from '@/lib/schemas/staff-preferences';

const STORAGE_KEY = 'cf.time-format';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function isTimeFormat(v: unknown): v is TimeFormat {
  return typeof v === 'string' && (TIME_FORMAT_VALUES as readonly string[]).includes(v);
}

function readStored(): TimeFormat {
  if (!isBrowser()) return DEFAULT_TIME_FORMAT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isTimeFormat(raw) ? raw : DEFAULT_TIME_FORMAT;
  } catch {
    return DEFAULT_TIME_FORMAT;
  }
}

let format: TimeFormat = readStored();
const listeners = new Set<() => void>();
let persister: ((value: TimeFormat) => void) | null = null;

function emit(): void {
  listeners.forEach((l) => l());
}

function writeStored(value: TimeFormat): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* storage blocked — store still works in-memory for the session */
  }
}

/** Current clock format. Defaults to `12h` on the server and before hydration. */
export function getTimeFormat(): TimeFormat {
  return format;
}

/** True when the user prefers 12-hour (AM/PM) — the resolution the formatters use. */
export function isHour12(): boolean {
  return format === '12h';
}

/** Set + persist (localStorage immediately, server via the registered persister). */
export function setTimeFormat(value: TimeFormat): void {
  if (!isTimeFormat(value) || value === format) return;
  format = value;
  writeStored(value);
  persister?.(value);
  emit();
}

/** Adopt a server value WITHOUT writing it back (hydration only). Null /
 * garbage leave the localStorage-backed value alone — same contract as
 * {@link hydrateHotkey}. Sync bridges must be one-shot; a missing field on a
 * concurrent prefs write must never snap the clock back to 12h. */
export function hydrateTimeFormat(value: string | null | undefined): void {
  if (!isTimeFormat(value) || value === format) return;
  format = value;
  writeStored(value);
  emit();
}

/** Register how setTimeFormat persists to the server (called once by TimeFormatSync). */
export function setTimeFormatPersister(fn: ((value: TimeFormat) => void) | null): void {
  persister = fn;
}

/** React store subscription (useSyncExternalStore). */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
