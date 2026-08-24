/**
 * Scan-dock policy store — which surface currently owns the global scan input.
 *
 * The problem this solves is a REMOUNT, not a layout. Every station bar used to
 * live inside its surface's sidebar panel, and those panels are swapped by
 * component identity: `TechSidebarPanel` renders `TestingSidebarPanel` or
 * `ShippingSidebarPanel` depending on the mode, so React unmounts one and
 * mounts the other. The scan input went with it — value, focus, and the DOM
 * node itself. On the QC → Ready to Pack jump the command router performs, the
 * operator's cursor landed nowhere.
 *
 * `GlobalHeader` is mounted once in `ResponsiveLayout`, which lives in the ROOT
 * layout, and the App Router never remounts that across a client navigation. So
 * an input mounted THERE survives every jump. This store is what lets it: the
 * dock owns the input, and each surface publishes the POLICY that makes it
 * behave like that surface's bar.
 *
 * Same shape and same altitude as `station-scan-sink/store.ts` — a module
 * singleton with a subscriber set, not a React context. The publisher (a
 * sidebar panel deep in the page tree) and the consumer (the header, above it)
 * have no common ancestor below the root, so context would mean hoisting state
 * to the root anyway; this is that, without the provider.
 *
 * ## Two halves, two channels
 *
 * A policy is split into a STABLE half (scalars: id, placeholder, staffId …)
 * and a VOLATILE half ({@link ScanDockHandlers} — callbacks and a `ReactNode`
 * rail). The volatile half is held by the publisher in a ref and read THROUGH
 * at submit/paint time; it is never a registration input.
 *
 * That split is load-bearing, not tidiness. Registration is a last-in-wins
 * STACK, and `registerScanDockPolicy` re-pushes on every call. Until 2026-08-22
 * `useScanDock` listed `onSubmit` and `rightContent` in its effect deps — both
 * get a fresh identity on every render at the natural call site (an inline
 * arrow, inline JSX) — so an ordinary re-render unregistered and re-registered.
 * Three costs, in rising order of severity:
 *
 *   1. churn on the scan path, the one path this repo works hard to keep off
 *      the React fiber;
 *   2. a window inside the effect flush where the dock's active policy is the
 *      PREVIOUS one, which is what drives the dock's clear-value-on-id-change;
 *   3. the real defect — a background publisher that merely re-renders jumps
 *      back to the TOP of the stack and **steals the dock from the foreground
 *      surface**, with no scan, no navigation, and nothing on screen to explain
 *      it.
 *
 * So: identity changes go through `registerScanDockPolicy` (rare), repaints go
 * through {@link touchScanDockContent} (cheap, and only when a surface actually
 * publishes a rail).
 */

import type { ReactNode, Ref } from 'react';
import type { UnboxPreviewHit } from '@/lib/receiving/preview-scan';

/**
 * The ONE bar's typed mode vocabulary.
 *
 * `rightContent` stays an opaque `ReactNode` on purpose — the scan TYPE rail is
 * surface vocabulary (Tracking · PO# · Serial · SKU · Amz Prep …) and folding
 * every station's types into one dock-owned union would be the twin this design
 * exists to avoid. The MODE is the opposite: it is not vocabulary, it is
 * BEHAVIOUR, and it is the same behaviour everywhere.
 *
 *   - `scan`   — the surface's own resolver runs. Nothing else. This is the hot
 *                path; it must not grow a lookup round trip.
 *   - `search` — ask the system what the value is. Found → show the record and
 *                its status. Not found → say so, and change nothing.
 *   - `input`  — same lookup, but a miss is the point: file the value under the
 *                active session's scan type instead of reporting nothing.
 */
export type ScanDockMode = 'scan' | 'search' | 'input';

export const SCAN_DOCK_MODES: readonly ScanDockMode[] = ['scan', 'search', 'input'];

/** Scan-only default for a surface that has not declared its modes. */
export const SCAN_DOCK_DEFAULT_MODES: readonly ScanDockMode[] = ['scan'];

/** What a value resolved to when it IS in the system. */
export interface ScanDockHit {
  /** Operator-facing identity — a tracking #, PO #, serial, title. */
  label: string;
  /** Lifecycle status of that record, as the surface would name it. */
  status?: string | null;
  /** Secondary line (location, owner, count) — optional. */
  detail?: string | null;
}

/**
 * The volatile half of a policy — everything whose identity changes per render.
 *
 * The dock reads this through the publisher's ref at the moment it needs it, so
 * a fresh inline arrow costs nothing and can never be stale.
 */
export interface ScanDockHandlers {
  /**
   * `scan` mode's resolver — exactly what this surface's own bar submit called.
   * Receives the trimmed value, because the dock owns the input state and the
   * surface's mirror of it may not have committed yet.
   */
  onSubmit: (value: string) => void;
  /**
   * Keystroke mirror. The dock owns the value (that ownership is the whole
   * point), but surfaces that filter a rail by what is typed need to see it.
   */
  onValueChange?: (value: string) => void;
  /** `search` / `input` mode's read — "is this already in the system?" */
  lookup?: (value: string, mode: ScanDockMode) => Promise<ScanDockHit | null>;
  /**
   * `input` mode's write, run only on a lookup MISS. `scanType` is the active
   * session's type — what the new record gets filed under.
   */
  onInput?: (value: string, scanType: string | null) => void | Promise<void>;
  /**
   * Preview stance's READ (`GET /api/receiving/preview-scan`) — resolve the
   * value against the same tables a scan would open, with none of its writes.
   * A bar with no `previewLookup` HAS no Preview stance.
   */
  previewLookup?: (value: string) => Promise<UnboxPreviewHit | null>;
  /**
   * The surface's own scan-TYPE rail, rendered in the bar's right slot. Carried
   * as a node so a migrating surface loses nothing.
   */
  rightContent?: ReactNode;
}

/** A live handle on the publisher's volatile half. */
export interface ScanDockHandlersRef {
  readonly current: ScanDockHandlers;
}

export interface ScanDockPolicy {
  /**
   * Stable identity for the publishing surface + mode (e.g. `tech:testing`).
   *
   * The dock clears its VALUE when this changes but keeps FOCUS. That split is
   * the contract: focus continuity is the whole point of the dock, while
   * carrying a half-typed serial from Quality Control to Ready to Pack would
   * hand the next bench a value its resolver never saw scanned.
   */
  id: string;
  placeholder?: string;
  /** Spinner in the bar's right rail while a lookup is in flight. */
  isResolving?: boolean;
  /** Staff id — resolves the themed bottom rule / submit trace. */
  staffId?: string | number | null;
  /** Focus the dock when this surface takes ownership. */
  autoFocus?: boolean;
  /**
   * One-off bottom rule, overriding the staff theme. Exists for session
   * capture (Arrival batch-sort's amber rule), which has to be impossible to
   * miss — not for per-surface decoration.
   */
  inputBorderClassName?: string;
  /** One-off submit-trace fill (Scan-out's emerald ship confirm). */
  submitTraceClassName?: string;
  /**
   * The publishing host's own handle on the input.
   *
   * Hosts that used to render the bar kept a ref and focus it directly
   * (`ShippingScanBand`'s manual-mode escape, the receiving panel's
   * focus-scan). The dock forwards its real input node into this alongside its
   * own ref, so those call sites keep working instead of silently focusing a
   * node that no longer exists.
   */
  inputRef?: Ref<HTMLInputElement>;
  /** Modes this surface offers; first is the default. Defaults to scan-only. */
  modes?: readonly ScanDockMode[];
  /**
   * The active session's scan type — what `input` mode files a new record
   * under. Null means the surface cannot create, so `input` has nothing to do.
   */
  scanType?: string | null;
  /**
   * Identity of the vocabulary a preview resolves against (the armed type, or
   * `auto`). Changing it re-runs the open for the value already on the bar.
   */
  previewMode?: string;
  /** The volatile half — read through, never a registration input. */
  handlers: ScanDockHandlersRef;
}

const policies: ScanDockPolicy[] = [];
const listeners = new Set<() => void>();
const contentListeners = new Set<() => void>();
let contentVersion = 0;

function emit(): void {
  listeners.forEach((l) => l());
}

/**
 * Publish a policy and become the dock's owner. Returns an unregister that
 * falls back to the previous publisher — the same last-in-wins stack
 * `scan-hotkey/store.ts` uses for focus targets, so a transient overlay that
 * publishes does not permanently steal the bar when it closes.
 *
 * **Call this only when the STABLE half changes.** See the module docblock: a
 * re-push moves the caller to the top of the stack, which is theft when the
 * caller is a background surface that merely re-rendered.
 */
export function registerScanDockPolicy(policy: ScanDockPolicy): () => void {
  const existing = policies.findIndex((p) => p.id === policy.id);
  if (existing >= 0) policies.splice(existing, 1);
  policies.push(policy);
  emit();
  return () => {
    const at = policies.indexOf(policy);
    // Guard the replace-same-id case: a re-publish pushed a NEWER object under
    // this id, and the stale cleanup must not delete it.
    if (at >= 0) {
      policies.splice(at, 1);
      emit();
    }
  };
}

export function getActiveScanDockPolicy(): ScanDockPolicy | null {
  return policies.length ? policies[policies.length - 1] : null;
}

export function subscribeScanDock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Repaint channel for the volatile half.
 *
 * `rightContent` is a `ReactNode`, so a publisher's re-render always produces a
 * new element and there is nothing cheap to diff. Rather than pay a
 * register/unregister for that, the publisher bumps a counter and the dock
 * re-reads the ref it already holds. One cheap re-render of a 40px header cell,
 * with no effect on WHO owns the dock — which is the property the old dep array
 * was destroying.
 *
 * A surface that publishes no rail never calls this at all.
 */
export function touchScanDockContent(): void {
  contentVersion += 1;
  contentListeners.forEach((l) => l());
}

export function getScanDockContentVersion(): number {
  return contentVersion;
}

export function subscribeScanDockContent(listener: () => void): () => void {
  contentListeners.add(listener);
  return () => {
    contentListeners.delete(listener);
  };
}

/** Modes a policy offers, normalised. */
export function scanDockModes(policy: ScanDockPolicy | null): readonly ScanDockMode[] {
  const declared = policy?.modes;
  return declared && declared.length ? declared : SCAN_DOCK_DEFAULT_MODES;
}

/* ------------------------------------------------------------------ *
 * The value handle
 * ------------------------------------------------------------------ */

interface ScanDockValueHandle {
  get: () => string;
  set: (next: string) => void;
}

let valueHandle: ScanDockValueHandle | null = null;
let focusHandle: (() => void) | null = null;

/**
 * The dock publishes an imperative handle on the input it owns.
 *
 * One caller needs it: `useScanTypeKeybinds`, whose wedge-burst flush appends
 * the swallowed mode key back onto the FIELD (`onChange(value + flushed)`).
 * That listener lives with the surface, because the scan TYPES it arms are
 * surface vocabulary — but the field it writes to is now the dock's. Without
 * this the flush would land in the surface's mirror and a scanner's "1…Enter"
 * would silently lose its first character.
 */
export function bindScanDockValue(handle: ScanDockValueHandle): () => void {
  valueHandle = handle;
  return () => {
    if (valueHandle === handle) valueHandle = null;
  };
}

export function getScanDockValue(): string {
  return valueHandle?.get() ?? '';
}

export function setScanDockValue(next: string): void {
  valueHandle?.set(next);
}

/**
 * Focus the one input, from anywhere.
 *
 * The replacement for `document.querySelector('[data-x-scan] input')?.focus()`
 * — every surface used to grow its own selector for its own bar, and there is
 * one bar now.
 */
export function bindScanDockFocus(focus: () => void): () => void {
  focusHandle = focus;
  return () => {
    if (focusHandle === focus) focusHandle = null;
  };
}

export function focusScanDock(): void {
  focusHandle?.();
}

/** Test seam — node:test only. */
export function __resetScanDockForTests(): void {
  policies.length = 0;
  listeners.clear();
  contentListeners.clear();
  contentVersion = 0;
  valueHandle = null;
  focusHandle = null;
}
