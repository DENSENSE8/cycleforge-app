'use client';

/**
 * Nav-keys leader store — THE single owner of the `⌘;` leader chord and the
 * region-arm keyboard (spec: `docs/todo/nav-keys-selection-keyboard-HANDOFF.md`).
 *
 * Same module-store shape as `scan-hotkey/store` and `overlay-stack/store`: a
 * framework-agnostic store consumed through `useNavRegion` / `useNavMode`, with
 * ONE global keydown listener installed lazily on first subscribe/register.
 *
 * OWNERSHIP + COEXISTENCE
 *  - The leader is `⌘;` / `Ctrl+;` — a modifier chord, so a barcode wedge (which
 *    emits no modifiers) can never arm it. It is not one of the seven existing
 *    owners (⌘K · ⌘B · ⌘] · ⌘\ · ⌘⇧V · ⌘1-9 · Escape).
 *  - While a session is live the store `pushOverlay()`s the overlay-stack, so the
 *    ambient record / queue keyboards stand down and nav owns the keys.
 *  - The listener is CAPTURE phase: mapped keys `preventDefault` + `stopPropagation`
 *    so a letter can never fall through into a focused input ("the scan bar cannot
 *    be typed into while armed").
 *
 * WEDGE SAFETY (all live here)
 *  - refuse to arm while a text input holds focus (the machine's `leader.editable`),
 *  - a ~1.5s idle timeout, a pointerdown / blur / tab-hide cancel, Escape cancel,
 *  - a scan-burst detector (keys faster than a human = a wedge → drop nav, don't act),
 *  - and an unmapped key exits WITHOUT swallowing the keystroke.
 */

import { pushOverlay } from '@/lib/overlay-stack/store';
import {
  NAV_IDLE,
  navReduce,
  type NavMode,
} from './nav-leader-machine';
import { regionForKey, type NavRegionId } from './nav-regions';
import { matchNavKey } from './resolveNavKeymap';

/** Idle-timeout before a half-entered session auto-disarms. */
const NAV_ARM_TIMEOUT_MS = 1500;
/** Below this inter-key gap a burst is a scanner, not a human — drop nav. */
const NAV_SCAN_BURST_MS = 30;

interface NavRegionHandle {
  id: NavRegionId;
  /** Live resolved keymap (target id → letter) — read at keystroke time. */
  getKeymap: () => ReadonlyMap<string, string>;
  /** Open / select a target id in this region. */
  commit: (targetId: string) => void;
}

let mode: NavMode = NAV_IDLE;
const listeners = new Set<() => void>();
const regions = new Map<NavRegionId, NavRegionHandle>();
let armTimer: number | null = null;
let overlayRelease: (() => void) | null = null;
let lastKeyTs = 0;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function emit(): void {
  for (const l of listeners) l();
}

function isEditableTarget(node: EventTarget | null): boolean {
  const el = node instanceof HTMLElement ? node : null;
  const active =
    el ?? (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null);
  if (!active) return false;
  const tag = active.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (active.isContentEditable) return true;
  const role = active.getAttribute('role');
  return role === 'textbox' || role === 'searchbox' || role === 'combobox';
}

/** `⌘;` / `Ctrl+;` — no Shift, no Alt; layout-robust via key OR physical code. */
function isLeaderChord(e: KeyboardEvent): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return false;
  return e.key === ';' || e.code === 'Semicolon';
}

function clearArmTimer(): void {
  if (armTimer != null) {
    window.clearTimeout(armTimer);
    armTimer = null;
  }
}

function setMode(next: NavMode): void {
  const wasIdle = mode.phase === 'idle';
  const nowIdle = next.phase === 'idle';
  mode = next;

  // Claim the overlay stack for the whole live session so ambient keyboards yield.
  if (wasIdle && !nowIdle) {
    overlayRelease = pushOverlay();
  } else if (!wasIdle && nowIdle) {
    overlayRelease?.();
    overlayRelease = null;
  }

  clearArmTimer();
  if (!nowIdle && isBrowser()) {
    armTimer = window.setTimeout(cancel, NAV_ARM_TIMEOUT_MS);
  }
  emit();
}

function cancel(): void {
  if (mode.phase !== 'idle') setMode(NAV_IDLE);
}

function onKeyDown(e: KeyboardEvent): void {
  // Leader — arms (or restarts) from any phase, unless a text input is focused.
  if (isLeaderChord(e)) {
    const step = navReduce(mode, { type: 'leader', editable: isEditableTarget(e.target) });
    if (step.consumed) {
      e.preventDefault();
      e.stopPropagation();
      lastKeyTs = e.timeStamp;
      setMode(step.mode);
    }
    return;
  }

  if (mode.phase === 'idle') return; // nav not active — let everything through

  // Escape cancels, owned (so nothing else acts on it either).
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    cancel();
    return;
  }
  // A modifier combo (⌘K, browser chords) — yield nav, let the chord run.
  if (e.metaKey || e.ctrlKey || e.altKey) {
    cancel();
    return;
  }
  // Scan-burst: a key faster than a human is a wedge — drop nav, act on nothing.
  const dt = e.timeStamp - lastKeyTs;
  lastKeyTs = e.timeStamp;
  if (dt >= 0 && dt < NAV_SCAN_BURST_MS) {
    cancel();
    return;
  }

  if (mode.phase === 'pick') {
    const region = regionForKey(e.key);
    const available = region != null && regions.has(region);
    const step = navReduce(mode, { type: 'regionKey', region, available });
    if (step.consumed) {
      e.preventDefault();
      e.stopPropagation();
    }
    setMode(step.mode);
    return;
  }

  // Armed — match a live target letter and commit it.
  const handle = regions.get(mode.region);
  const targetId = handle ? matchNavKey(e.key, handle.getKeymap()) : null;
  if (handle && targetId) {
    e.preventDefault();
    e.stopPropagation();
    setMode(navReduce(mode, { type: 'commit' }).mode);
    handle.commit(targetId);
    return;
  }
  // Unmapped key in an armed region — exit WITHOUT swallowing it.
  cancel();
}

let installed = false;
function ensureListeners(): void {
  if (installed || !isBrowser()) return;
  installed = true;
  window.addEventListener('keydown', onKeyDown, { capture: true });
  // A click / focus-out / tab-hide cancels a half-entered session (no-op idle).
  window.addEventListener('pointerdown', cancel, { capture: true });
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') cancel();
  });
}

/** Register a region's live handle. Last registration for an id wins; the
 *  returned unregister removes only its own handle. */
export function registerNavRegion(handle: NavRegionHandle): () => void {
  ensureListeners();
  regions.set(handle.id, handle);
  emit();
  return () => {
    if (regions.get(handle.id) === handle) {
      regions.delete(handle.id);
      emit();
    }
  };
}

export function subscribeNavMode(listener: () => void): () => void {
  ensureListeners();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getNavMode(): NavMode {
  return mode;
}

/** Overlays / nav mode are client-only chrome — nothing is armed on SSR. */
export function getServerNavMode(): NavMode {
  return NAV_IDLE;
}
