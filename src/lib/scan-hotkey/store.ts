/**
 * Scan-focus hotkey — a tiny framework-agnostic store shared by EVERY
 * ScanBar across the app.
 *
 * Responsibilities:
 *   1. Hold the current focus binding (any non-reserved key; default "Insert").
 *      Hydrated from localStorage; durable SoT is staff_preferences.
 *      Insert / ScrollLock / F1–F12 reclaim even while an input is focused;
 *      other bindings yield over editable targets so typing is not stolen.
 *   2. Keep a stack of mounted scan-bar targets. Most-recently-registered wins.
 *   3. ONE global keydown listener:
 *        - bare reclaim key → focus + select (reclaim mid-carton)
 *        - ⌘. / Ctrl+. → **arm next scan** (clear value + focus + select)
 *          — the station ingestion bar for the next carton, not the Unbox dock
 *          wedge (`receiving-focus-scan` / `⌘; m → s` owns that locus).
 *   4. Pointer APIs (`requestScanFocus` / `requestScanNext`) for the gear
 *      popover chips — same focus path as the keys, without entering rebind.
 *
 * Pure module, no React imports — consumed via useScanHotkey / useRegisterScanTarget.
 */

import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import {
  DEFAULT_FOCUS_SCAN_HOTKEY,
  FOCUS_SCAN_ALWAYS_AVAILABLE_RE,
  isBindableFocusScanHotkey,
} from '@/lib/schemas/staff-preferences-constants';

/**
 * localStorage namespace for the device mirror. Scoped per (org, staff) by
 * {@link setScanHotkeyIdentity} — the bare prefix is never a key on its own.
 *
 * It WAS a bare `'scan:focus-hotkey'`, and on this floor that is a leak rather
 * than a nicety. A shared terminal is the normal case here: staffer A binds
 * ScrollLock, signs out, staffer B signs in, and between page load and the
 * prefs GET resolving, B's benches are listening on A's reclaim key. The server
 * value does win once `hydrateHotkey` lands, so it was a window rather than a
 * permanent swap — but it is the same `cf.quickAccess` hazard the workspace and
 * keybinding mirrors are both keyed to avoid, and those two set the house shape
 * (`${prefix}:${orgId}:${staffId}`).
 */
const STORAGE_PREFIX = 'scan:focus-hotkey';

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/** Whose hotkey this tab is holding. Null until the session identifies. */
let identity: string | null = null;

function storageKey(): string | null {
  return identity ? `${STORAGE_PREFIX}:${identity}` : null;
}

function readStored(): string {
  const key = storageKey();
  if (!isBrowser() || !key) return DEFAULT_FOCUS_SCAN_HOTKEY;
  try {
    const raw = window.localStorage.getItem(key);
    return raw && isBindableFocusScanHotkey(raw) ? raw : DEFAULT_FOCUS_SCAN_HOTKEY;
  } catch {
    return DEFAULT_FOCUS_SCAN_HOTKEY;
  }
}

/*
 * Starts at the DEFAULT rather than at a stored value, because at module-eval
 * time nobody has signed in yet and there is no honest per-staff answer to
 * read. The mirror is adopted a moment later by {@link setScanHotkeyIdentity},
 * which is the first point at which "whose hotkey?" has an answer.
 */
let hotkey: string = DEFAULT_FOCUS_SCAN_HOTKEY;
const listeners = new Set<() => void>();

type ScanBarTarget = {
  /** Focus + select — reclaim without clearing typed text. */
  focus: () => void;
  /**
   * Clear the bar value, then focus + select — arm for the next carton scan.
   * Sidebar ingestion only; dock wedge fields never register here.
   */
  armNext: () => void;
  /**
   * Hand a wedge payload to the bar instead of letting the app resolve it.
   * Preview stance's escape hatch at the wedge waist — see
   * {@link deliverScanToTarget}. Optional: a bar that cannot accept a value
   * (no controlled `onChange`) simply declines and the scan falls through.
   */
  deliver?: (value: string) => boolean;
};

const targets: ScanBarTarget[] = [];
let persister: ((key: string) => void) | null = null;

// While a gear is in "press a key" capture mode the global listener must stand
// down so the capture handler can grab the next keystroke.
let capturing = false;

function emit(): void {
  listeners.forEach((l) => l());
}

function writeStored(key: string): void {
  const storage = storageKey();
  // No identity, no write. An unscoped key is exactly what the next staffer on
  // this terminal would read, so declining to write it is the fix; the value is
  // still live in memory for this session and still PUT to the server.
  if (!isBrowser() || !storage) return;
  try {
    window.localStorage.setItem(storage, key);
  } catch {
    /* storage blocked — store still works in-memory for the session */
  }
}

/**
 * Name whose hotkey this tab holds, and adopt their device mirror.
 *
 * Called by `ScanHotkeySync` as soon as the verified session resolves, and
 * again with `null` on sign-out. Signing out resets to the default rather than
 * leaving the previous staffer's binding in memory — the mirror keeps their
 * value under their own key, so signing back in restores it.
 */
export function setScanHotkeyIdentity(
  next: { orgId: string; staffId: string | number } | null,
): void {
  const token = next ? `${next.orgId}:${next.staffId}` : null;
  if (token === identity) return;
  identity = token;
  const adopted = readStored();
  if (adopted === hotkey) return;
  hotkey = adopted;
  emit();
}

export function getHotkey(): string {
  return hotkey;
}

/** Set + persist (localStorage immediately, server via the registered persister). */
export function setHotkey(key: string): void {
  if (!isBindableFocusScanHotkey(key) || key === hotkey) return;
  hotkey = key;
  writeStored(key);
  persister?.(key);
  emit();
}

/** Adopt a server value WITHOUT writing it back (hydration only). */
export function hydrateHotkey(key: string | null | undefined): void {
  if (!key || !isBindableFocusScanHotkey(key) || key === hotkey) return;
  hotkey = key;
  writeStored(key);
  emit();
}

/** Register how setHotkey should persist to the server (called once by ScanHotkeySync). */
export function setHotkeyPersister(fn: ((key: string) => void) | null): void {
  persister = fn;
}

export function setCapturing(value: boolean): void {
  capturing = value;
}

/** True while the scan-bar gear is capturing a new reclaim key. */
export function isCapturing(): boolean {
  return capturing;
}

/** React store subscription (useSyncExternalStore). Installs the global listener once. */
export function subscribe(listener: () => void): () => void {
  ensureGlobalListener();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Register a scan-bar target while mounted. Most-recently-registered wins.
 * Returns an unregister fn for cleanup on unmount.
 */
export function registerScanTarget(target: ScanBarTarget): () => void {
  ensureGlobalListener();
  targets.push(target);
  return () => {
    const i = targets.lastIndexOf(target);
    if (i >= 0) targets.splice(i, 1);
  };
}

/**
 * Fired on `window` immediately before focus / arm-next moves to the active
 * scan bar. Transient chrome that can cover the bench listens and dismisses.
 * Kept module-private — listeners use the string literal or a future SoT import
 * if a consumer remounts.
 */
const SCAN_FOCUS_REQUESTED_EVENT = 'scan-focus-requested';

/** Fired immediately before ⌘. arms the next-scan bar (clear + focus). */
const SCAN_NEXT_REQUESTED_EVENT = 'scan-next-requested';

function topTarget(): ScanBarTarget | undefined {
  return targets[targets.length - 1];
}

function focusTopTarget(): void {
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(SCAN_FOCUS_REQUESTED_EVENT));
  }
  topTarget()?.focus();
}

function armNextTopTarget(): void {
  if (isBrowser()) {
    window.dispatchEvent(new CustomEvent(SCAN_FOCUS_REQUESTED_EVENT));
    window.dispatchEvent(new CustomEvent(SCAN_NEXT_REQUESTED_EVENT));
  }
  topTarget()?.armNext();
}

/**
 * Route a wedge payload into the mounted scan bar rather than resolving it.
 *
 * The one door Preview stance uses from {@link useGlobalWedgeScanner}: a
 * physical scan lands wherever focus happens to be, so without this the stance
 * was only ever honored on the typed-Enter path and a real scanner navigated
 * straight past it. Returns false when no mounted bar can take the value, so
 * the caller keeps its normal ladder.
 */
export function deliverScanToTarget(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return topTarget()?.deliver?.(trimmed) ?? false;
}

/** Pointer reclaim — same path as the bare reclaim key (keep typed text). */
export function requestScanFocus(): void {
  focusTopTarget();
}

/** Pointer next-scan — same path as ⌘. / Ctrl+. (clear + focus). */
export function requestScanNext(): void {
  armNextTopTarget();
}

/**
 * Operator-facing face for the universal next-scan chord (clear + focus the
 * station Ticket · Tracking · PO bar). House glyph is Mac-first (`⌘.`); the
 * binder also accepts Ctrl+. — never remap via the focus-scan picker.
 */
export const NEXT_SCAN_CHORD_LABEL = '⌘.';

/** `⌘.` / `Ctrl+.` — arm next carton scan (clear + focus). Universal next-scan. */
export function isNextScanChord(e: KeyboardEvent): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return false;
  return e.key === '.' || e.code === 'Period';
}

let installed = false;
function ensureGlobalListener(): void {
  if (installed || !isBrowser()) return;
  installed = true;
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (capturing) return; // capture handler owns the keystroke

      // ⌘. / Ctrl+. — arm next scan (clear + focus). Capture-phase so we beat
      // ambient handlers. Chosen over ⌘Q (macOS Quit) and ⌘W (Close Tab).
      if (isNextScanChord(e)) {
        e.preventDefault();
        e.stopPropagation();
        armNextTopTarget();
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Shift+<hotkey> is a DIFFERENT chord — Pending grid binds Shift+F2.
      if (e.shiftKey) return;
      if (e.key !== hotkey) return;
      // Printable / custom reclaim keys yield while typing; Insert · F* ·
      // ScrollLock still reclaim from mid-field (warehouse classic).
      if (
        !FOCUS_SCAN_ALWAYS_AVAILABLE_RE.test(hotkey) &&
        isEditableKeyTarget(e.target)
      ) {
        return;
      }
      e.preventDefault();
      focusTopTarget();
    },
    { capture: true },
  );
}
