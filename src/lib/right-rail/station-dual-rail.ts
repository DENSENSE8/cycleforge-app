'use client';

/**
 * Scan-station dual-rail coupling — Unbox · Arrival · Testing only.
 *
 * When the left context rail and right Displays are both open, a sash drag on
 * either side redistributes width inversely while the middle stays locked at
 * {@link STATION_WORKBENCH_LOCK_PX} (720):
 *
 *   left' + 720 + displays' = frame
 *
 * Desk RightRailHost inspectors are out of scope.
 *
 * Persistence stays on the existing keys ({@link CONTEXT_PANEL_RESIZE}.storageKey
 * + the per-surface Displays `storageKey`) — no third localStorage key.
 */

import { CONTEXT_PANEL_RESIZE } from '@/components/sidebar/context-panel-column';
import {
  STATION_DISPLAYS_MIN_WIDTH_PX,
  STATION_WORKBENCH_LOCK_PX,
} from '@/components/station/workbench/workbench-layout';
import {
  getContextRailCostOpenPx,
  getRailOperatorCollapsed,
  getRightRailFrameWidthPx,
  getStationPushActive,
  getStationPushDesiredWidthPx,
  setRightRailContextRail,
  setStationPushDemand,
} from '@/lib/right-rail/frame';

type StationDualRailPrimary = 'context' | 'displays';

interface StationDualRailInput {
  frameWidthPx: number;
  leftPx: number;
  displaysPx: number;
  /** Signed change applied to {@link primary} (positive grows that column). */
  deltaPx: number;
  primary: StationDualRailPrimary;
  leftMinPx?: number;
  displaysMinPx?: number;
  middleLockPx?: number;
}

interface StationDualRailResult {
  leftPx: number;
  displaysPx: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Pure inverse-delta math with a hard middle lock.
 *
 * After applying Δ to the primary column, re-pin so
 * `left + middleLock + displays === frame` (within peer mins).
 */
export function resolveStationDualRailDelta(
  input: StationDualRailInput,
): StationDualRailResult {
  const leftMin = input.leftMinPx ?? CONTEXT_PANEL_RESIZE.minWidthPx;
  const displaysMin = input.displaysMinPx ?? STATION_DISPLAYS_MIN_WIDTH_PX;
  const middleLock = input.middleLockPx ?? STATION_WORKBENCH_LOCK_PX;
  const frame = Number.isFinite(input.frameWidthPx)
    ? Math.max(0, input.frameWidthPx)
    : 0;

  const leftMax = Math.max(leftMin, frame - middleLock - displaysMin);
  const displaysMax = Math.max(displaysMin, frame - middleLock - leftMin);

  const left0 = clamp(input.leftPx, leftMin, leftMax);
  const displays0 = clamp(input.displaysPx, displaysMin, displaysMax);
  const delta = Number.isFinite(input.deltaPx) ? input.deltaPx : 0;

  if (frame <= 0) {
    return { leftPx: left0, displaysPx: displays0 };
  }

  // Prefer exact fill: displays residual after left + middle lock.
  const pinDisplays = (left: number) =>
    clamp(frame - middleLock - left, displaysMin, displaysMax);
  const pinLeft = (displays: number) =>
    clamp(frame - middleLock - displays, leftMin, leftMax);

  if (delta === 0) {
    // Re-pin to the equation without changing preference intent.
    const left = left0;
    return { leftPx: left, displaysPx: pinDisplays(left) };
  }

  if (input.primary === 'displays') {
    const displays1 = clamp(displays0 + delta, displaysMin, displaysMax);
    const left1 = pinLeft(displays1);
    return { leftPx: left1, displaysPx: pinDisplays(left1) };
  }

  const left1 = clamp(left0 + delta, leftMin, leftMax);
  return { leftPx: left1, displaysPx: pinDisplays(left1) };
}

// ── Coupling bus (writers notify the peer rail to setWidth) ─────────────────

type StationCoupledSource = StationDualRailPrimary;

interface StationCoupledSnapshot {
  leftPx: number;
  displaysPx: number;
  source: StationCoupledSource;
  epoch: number;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let snapshot: StationCoupledSnapshot | null = null;
let displaysStorageKey: string | null = null;

const SERVER_SNAPSHOT: StationCoupledSnapshot | null = null;

function persistWidth(key: string, value: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, String(Math.round(value)));
  } catch {
    /* private mode / quota */
  }
}

function publish(next: StationCoupledSnapshot): void {
  snapshot = next;
  listeners.forEach((l) => l());
}

export function subscribeStationCoupled(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStationCoupled(): StationCoupledSnapshot | null {
  return snapshot;
}

export function getServerStationCoupled(): StationCoupledSnapshot | null {
  return SERVER_SNAPSHOT;
}

/**
 * Displays column registers its per-surface storage key while mounted so a
 * context-rail sash can persist the inverse Displays preference.
 */
export function registerStationDisplaysStorageKey(storageKey: string): () => void {
  displaysStorageKey = storageKey;
  return () => {
    if (displaysStorageKey === storageKey) displaysStorageKey = null;
  };
}

/**
 * Coupling is live only while station Displays push is active and the context
 * rail is open (not operator-collapsed).
 */
export function isStationDualRailCouplingActive(): boolean {
  if (!getStationPushActive()) return false;
  if (getRailOperatorCollapsed()) return false;
  if (getContextRailCostOpenPx() <= 0) return false;
  if (getRightRailFrameWidthPx() <= 0) return false;
  return true;
}

/**
 * Displays sash moved by `deltaPx` (positive = Displays wider). Updates the
 * context-rail preference inversely and notifies ContextPanelLayout.
 */
export function applyStationDisplaysDelta(
  deltaPx: number,
  live?: { leftPx: number; displaysPx: number },
): StationDualRailResult | null {
  if (!isStationDualRailCouplingActive()) return null;

  const leftPx = live?.leftPx ?? getContextRailCostOpenPx();
  const displaysPx = live?.displaysPx ?? getStationPushDesiredWidthPx();
  const next = resolveStationDualRailDelta({
    frameWidthPx: getRightRailFrameWidthPx(),
    leftPx,
    displaysPx,
    deltaPx,
    primary: 'displays',
  });

  if (next.leftPx === leftPx && next.displaysPx === displaysPx) {
    return next;
  }

  persistWidth(CONTEXT_PANEL_RESIZE.storageKey, next.leftPx);
  setRightRailContextRail({
    railCostOpenPx: next.leftPx,
    railOperatorCollapsed: false,
  });
  setStationPushDemand({ active: true, desiredWidthPx: next.displaysPx });

  publish({
    leftPx: next.leftPx,
    displaysPx: next.displaysPx,
    source: 'displays',
    epoch: (snapshot?.epoch ?? 0) + 1,
  });

  return next;
}

/**
 * Context-rail sash moved by `deltaPx` (positive = context wider). Updates the
 * Displays preference inversely and notifies UnboxPushColumn.
 */
export function applyStationContextDelta(
  deltaPx: number,
  live?: { leftPx: number; displaysPx: number },
): StationDualRailResult | null {
  if (!isStationDualRailCouplingActive()) return null;

  const leftPx = live?.leftPx ?? getContextRailCostOpenPx();
  const displaysPx = live?.displaysPx ?? getStationPushDesiredWidthPx();
  const next = resolveStationDualRailDelta({
    frameWidthPx: getRightRailFrameWidthPx(),
    leftPx,
    displaysPx,
    deltaPx,
    primary: 'context',
  });

  if (next.leftPx === leftPx && next.displaysPx === displaysPx) {
    return next;
  }

  persistWidth(CONTEXT_PANEL_RESIZE.storageKey, next.leftPx);
  if (displaysStorageKey) persistWidth(displaysStorageKey, next.displaysPx);

  setRightRailContextRail({
    railCostOpenPx: next.leftPx,
    railOperatorCollapsed: false,
  });
  setStationPushDemand({ active: true, desiredWidthPx: next.displaysPx });

  publish({
    leftPx: next.leftPx,
    displaysPx: next.displaysPx,
    source: 'context',
    epoch: (snapshot?.epoch ?? 0) + 1,
  });

  return next;
}
