'use client';

/**
 * Selection status-bar hotkeys — ONE hook for bind + `?` reveal.
 *
 * Pass the same action list you paint on {@link TableStatusBar}. Each action
 * that carries a `hotkey` is:
 *   1. bound while the strip is live (A / C / …)
 *   2. eligible for an absolute overlay letter after keyboard `?`
 *
 * Adding a new CTA: give it a `hotkey` (and register presentation meta in
 * {@link SELECTION_STATUS_BAR_META} if it needs a short label / fill). No second
 * listener to wire.
 *
 * `?` is handled HERE (same module as the surface counter) so reveal cannot
 * drift from a second bundle copy of the cheat sheet. Single-line filter/
 * search inputs do NOT swallow `?` while the strip is mounted — operators
 * usually have "Filter orders…" focused.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ButtonVariant } from '@/design-system/primitives/Button';
import { suppressTableKey } from '@/lib/keyboard/table-key-layer';
import { hasScanTarget } from '@/lib/scan-hotkey/store';
import { closeShortcutOverview } from '@/lib/keyboard/shortcut-overview';

export type SelectionStatusHotkeyAction = {
  key: string;
  /** Single letter, case-insensitive. Omit to skip bind + reveal. */
  hotkey?: string;
  onClick: () => void;
};

/**
 * Presentation SoT for selection CTAs on the table foot.
 * New verbs: add a row here (or rely on the action's own label + secondary fill).
 */
export const SELECTION_STATUS_BAR_META: Record<
  string,
  { label: string; variant: ButtonVariant; hotkey: string }
> = {
  assign: { label: 'Assign', variant: 'success', hotkey: 'a' },
  'assign-pick': { label: 'Assign pick', variant: 'success', hotkey: 'a' },
  'assign-pack': { label: 'Assign pack', variant: 'success', hotkey: 'k' },
  condition: { label: 'Condition', variant: 'secondary', hotkey: 'o' },
  qty: { label: 'Qty', variant: 'secondary', hotkey: 'q' },
  notes: { label: 'Notes', variant: 'secondary', hotkey: 'n' },
  copy: { label: 'Copy', variant: 'primary', hotkey: 'c' },
  // `l` belongs to Labels (operator R-FLOW-6, 2026-09-01): the To-ship lane
  // appends the Labels verb locally and two verbs cannot share a letter on
  // one strip, so Listing → staff moved to `r` (its "rule" half).
  labels: { label: 'Labels', variant: 'primary', hotkey: 'l' },
  'listing-rule': { label: 'Listing → staff', variant: 'brand', hotkey: 'r' },
  'ship-by': { label: 'Ship-by', variant: 'warning', hotkey: 'b' },
  print: { label: 'Product labels', variant: 'secondary', hotkey: 'p' },
  'print-shipping': { label: 'Shipping labels', variant: 'secondary', hotkey: 's' },
  flag: { label: 'Flag', variant: 'primarySoft', hotkey: 'f' },
  'download-photos': { label: 'Download', variant: 'secondary', hotkey: 'i' },
  delete: { label: 'Delete', variant: 'danger', hotkey: 'd' },
};

export const SELECTION_STATUS_BAR_ORDER = Object.keys(SELECTION_STATUS_BAR_META);

// ─── `?` reveal store (module-level so the cheat sheet can yield) ─────────────

type Listener = () => void;

let surfaceCount = 0;
let revealed = false;
const listeners = new Set<Listener>();

function emitReveal() {
  for (const listener of listeners) listener();
}

function subscribeReveal(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getRevealed(): boolean {
  return revealed;
}

/** Stable server snapshot — React warns if getServerSnapshot returns a fresh value each call. */
const SERVER_REVEALED = false;
function getServerRevealed(): boolean {
  return SERVER_REVEALED;
}

/** True while a selection CTA strip has registered — `?` reveals letters. */
export function isSelectionInlineHotkeySurfaceActive(): boolean {
  return surfaceCount > 0;
}

export function toggleSelectionInlineHotkeys(): void {
  if (surfaceCount === 0) return;
  revealed = !revealed;
  emitReveal();
}

export function getSelectionInlineHotkeysRevealed(): boolean {
  return revealed;
}

export function setSelectionInlineHotkeysRevealed(next: boolean): void {
  if (revealed === next) return;
  revealed = next;
  emitReveal();
}

export function registerSelectionInlineHotkeySurface(): () => void {
  return registerSurface();
}

function registerSurface(): () => void {
  surfaceCount += 1;
  emitReveal();
  return () => {
    surfaceCount = Math.max(0, surfaceCount - 1);
    if (surfaceCount === 0 && revealed) {
      revealed = false;
    }
    emitReveal();
  };
}

function hotkeySignature(actions: readonly SelectionStatusHotkeyAction[]): string {
  return actions
    .map((a) => `${a.key}:${(a.hotkey ?? '').trim().toLowerCase()}`)
    .join('|');
}

/**
 * `?` teaching chord while the selection strip is live.
 *
 * Allows single-line INPUT / searchbox (table filter). Still blocks TEXTAREA /
 * contenteditable so note-taking is not interrupted.
 */
export function shouldSuppressSelectionQuestionMark(
  target: EventTarget | null,
): boolean {
  if (target == null) return false;
  if (typeof HTMLElement === 'undefined') return false;
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === 'TEXTAREA') return true;
  if (target.tagName === 'SELECT') return true;
  if (target.closest('textarea, [contenteditable="true"]')) return true;
  // INPUT type=text|search (Filter orders…) must NOT swallow staff `?`.
  return false;
}

/**
 * Bind letter keys + own the `?` reveal surface for the current action list.
 *
 * @returns `showHotkeys` — paint absolute overlay letters when true.
 * @returns `toggleHotkeys` — same as pressing keyboard `?` (no foot control).
 */
export function useSelectionStatusBarHotkeys(
  actions: readonly SelectionStatusHotkeyAction[],
  enabled = true,
): {
  showHotkeys: boolean;
  toggleHotkeys: () => void;
} {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const signature = hotkeySignature(actions);

  const showHotkeys = useSyncExternalStore(
    subscribeReveal,
    getRevealed,
    getServerRevealed,
  );

  useEffect(() => {
    if (!enabled) return;
    return registerSurface();
  }, [enabled]);

  // `?` lives on this hook (same module as surfaceCount). Cheat sheet yields
  // when the surface is active so we do not double-toggle.
  useEffect(() => {
    if (!enabled) return;

    const onQuestion = (e: KeyboardEvent) => {
      if (e.key !== '?') return;
      if (e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (shouldSuppressSelectionQuestionMark(e.target)) return;
      // A scan must reach the bar intact. This handler calls preventDefault +
      // stopPropagation, so swallowing a `?` out of a wedge payload would
      // corrupt the scanned value — quieter than a fired verb, and just as
      // wrong. Only the scanner check is applied here: the full suppressor
      // would also block single-line inputs, and letting an operator press `?`
      // with "Filter orders…" focused is this handler's deliberate design.
      if (hasScanTarget()) return;

      e.preventDefault();
      e.stopPropagation();
      closeShortcutOverview();
      toggleSelectionInlineHotkeys();
    };

    window.addEventListener('keydown', onQuestion, true);
    return () => window.removeEventListener('keydown', onQuestion, true);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !signature) return;

    const byLetter = new Map<string, string>();
    for (const action of actionsRef.current) {
      const letter = action.hotkey?.trim().toLowerCase();
      if (!letter || letter.length !== 1) continue;
      if (!byLetter.has(letter)) byLetter.set(letter, action.key);
    }
    if (byLetter.size === 0) return;

    const onKey = (e: KeyboardEvent) => {
      // A chord is never one of these letters — and swallowing ⌘C here would
      // break native copy. Checked BEFORE the shared suppressor, which lets
      // chords through on purpose (a wedge scanner cannot type ⌘).
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // The house suppressor: already-handled → typing target → overlay →
      // SCANNER. The first three replace the hand-copied guards that used to
      // live here; the fourth is the one they were missing.
      //
      // Without it, a wedge scan of `SKU-1129` on a station with rows checked
      // is Ship-by, then Product labels, then Shipping labels — verbs fired by
      // a gesture the operator did not think of as typing. That is the exact
      // failure `table-key-layer`'s docblock describes.
      //
      // `ownsFocus: true` is a deliberate claim, not an oversight: this strip
      // scopes itself by a SELECTION existing rather than by focus, so it is
      // global while live. That is a weaker guarantee than WCAG 2.1.4's
      // focus-only option — if these letters ever need to be conformant on
      // their own, that is the line to revisit, not the scanner check.
      if (suppressTableKey(e, { layer: 'table', ownsFocus: true })) return;

      const letter = e.key.length === 1 ? e.key.toLowerCase() : '';
      if (!letter || letter === '?') return;
      const actionKey = byLetter.get(letter);
      if (!actionKey) return;
      const action = actionsRef.current.find((a) => a.key === actionKey);
      if (!action) return;

      e.preventDefault();
      e.stopPropagation();
      action.onClick();
    };

    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, signature]);

  return {
    showHotkeys: enabled && showHotkeys,
    toggleHotkeys: () => {
      closeShortcutOverview();
      toggleSelectionInlineHotkeys();
    },
  };
}

/** @deprecated Use {@link useSelectionStatusBarHotkeys}. */
export function useSelectionActionHotkeys(
  actions: readonly SelectionStatusHotkeyAction[],
  enabled = true,
): void {
  useSelectionStatusBarHotkeys(actions, enabled);
}
