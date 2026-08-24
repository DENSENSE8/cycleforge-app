/**
 * Active-session store — the single typed answer to "what is the operator
 * working on right now".
 *
 * WHY THIS EXISTS
 * The header used to learn its identity from the URL: `usePathname` fed through
 * the prefix matcher in `sidebar-navigation.ts`, so ROUTE *was* identity. In an
 * always-mounted HUD shell there is no route to read — a session is opened,
 * worked and closed without the URL moving — so the header has to be told, not
 * to guess.
 *
 * It replaces `contexts/HeaderContext.tsx`, whose middle zone carried a
 * `ReactNode`. A node cannot be diffed, serialized, restored after a reload, or
 * read by anything but React. Typed data can: the same record drives the header
 * chip, the window-manager tab, and any future persistence of an open session.
 *
 * SHAPE
 * Module singleton + subscriber set, read through `useSyncExternalStore` — the
 * same altitude as `lib/scan-dock/store.ts` and `lib/right-rail/store.ts`. The
 * publisher (a session tile, deep in the canvas) and the consumer (the header,
 * above it) share no ancestor below the root, so a context provider would only
 * be this store with extra ceremony.
 *
 * ONE SLOT, WHICH IS THE ARMING MODEL
 * There is exactly ONE active session. That is not a simplification of the
 * ruling, it IS the ruling: exactly one scan session is armed app-wide, so
 * arming a second disarms the first by construction. No `scanFocusTileId`, no
 * per-tile focus, no mount-order race. `getArmedScanSession()` is the whole
 * scan-ownership question, answered by a field read.
 *
 * WHAT THIS STORE IS NOT
 * It is not the session MODEL. It holds no lifecycle, no persistence, no list
 * of open sessions — the session-model lane owns those and calls
 * `setActiveSession` when focus moves. This is the header's view of it.
 */

/** The one discriminator. A scan session carries a `scanType`; a task never does. */
export type SessionKind = 'scan' | 'task';

/**
 * Which bench a scan session belongs to (`unbox`, `arrival`, `testing`,
 * `packing`, `pickup`, `triage`, …).
 *
 * Deliberately an open string: the closed vocabulary belongs to the
 * session-model lane, and pinning it here would fork a second enum that has to
 * be kept in sync with the real one. Narrow this to that lane's union once it
 * exists — the field name is the contract, not its domain.
 */
export type ScanSessionType = string;

/** The record being worked. Absent while a session is still empty. */
export interface SessionEntity {
  /** Entity family — `carton` · `order` · `unit` · `po` · … */
  type: string;
  /** Stable record id, for the header to link/open. */
  id: string;
  /** Operator-facing identifier: tracking last-8, order number, serial. */
  label: string;
}

/** Same tone vocabulary as `UnderlineValue` / `StatusMicroLabel`. */
export type SessionStatusTone =
  | 'neutral'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'purple';

/** Live status — the one thing that changes while a session stays open. */
export interface SessionStatus {
  label: string;
  tone: SessionStatusTone;
  /** 0..1 when the session has countable steps. Omitted when it does not. */
  progress?: number;
}

interface SessionBase {
  /** Stable identity of this session — the header's key and the ownership token. */
  id: string;
  /** What the operator is doing, in their words ("Unbox", "Pack order"). */
  title: string;
  entity?: SessionEntity | null;
  status?: SessionStatus | null;
  /** Epoch ms. Optional — elapsed time is a later phase's readout. */
  startedAt?: number;
}

export interface ScanSession extends SessionBase {
  kind: 'scan';
  /** Required on a scan session: a scan with no bench has nowhere to route. */
  scanType: ScanSessionType;
}

export interface TaskSession extends SessionBase {
  kind: 'task';
  scanType?: undefined;
}

export type ActiveSession = ScanSession | TaskSession;

let active: ActiveSession | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function sameEntity(
  a: SessionEntity | null | undefined,
  b: SessionEntity | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  return a.type === b.type && a.id === b.id && a.label === b.label;
}

function sameStatus(
  a: SessionStatus | null | undefined,
  b: SessionStatus | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  return a.label === b.label && a.tone === b.tone && a.progress === b.progress;
}

/**
 * Value equality over every field. The publish hook re-offers its session on
 * every render (nested `entity` / `status` literals get a fresh identity each
 * time), so without this a parent re-render would emit and repaint the header
 * on data that did not change.
 */
export function isSameSession(
  a: ActiveSession | null,
  b: ActiveSession | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.scanType === b.scanType &&
    a.title === b.title &&
    a.startedAt === b.startedAt &&
    sameEntity(a.entity, b.entity) &&
    sameStatus(a.status, b.status)
  );
}

/**
 * Publish the session the operator is working. Replaces whatever held the slot
 * — publishing a scan session is therefore what DISARMS the previous one.
 *
 * No-ops when the incoming value is field-identical to the current one.
 */
export function setActiveSession(next: ActiveSession | null): void {
  if (isSameSession(active, next)) return;
  active = next;
  emit();
}

/**
 * Release the slot, but only if `id` still owns it. The guard is what makes a
 * stale unmount cleanup safe: a session that already handed off to its
 * successor must not blank the header on its way out.
 */
export function clearActiveSession(id: string): void {
  if (!active || active.id !== id) return;
  active = null;
  emit();
}

/**
 * Patch the live session in place — status ticks, the entity resolving after a
 * scan — without the publisher restating its identity. No-ops when `id` does
 * not own the slot, so a background tile cannot narrate over the focused one.
 */
export function updateActiveSession(
  id: string,
  patch: Partial<Pick<SessionBase, 'title' | 'entity' | 'status'>>,
): void {
  if (!active || active.id !== id) return;
  setActiveSession({ ...active, ...patch } as ActiveSession);
}

export function getActiveSession(): ActiveSession | null {
  return active;
}

/** SSR snapshot. No session exists before the shell mounts. */
export function getServerActiveSession(): ActiveSession | null {
  return null;
}

/**
 * The whole of scan ownership: the armed scan session, or null when the
 * operator is on a task. The wedge listener routes here.
 */
export function getArmedScanSession(): ScanSession | null {
  return active && active.kind === 'scan' ? active : null;
}

export function subscribeActiveSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam — node:test only. */
export function __resetActiveSessionForTests(): void {
  active = null;
  listeners.clear();
}
