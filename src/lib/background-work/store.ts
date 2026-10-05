'use client';

/**
 * Background work — the ONE app-wide record of what the SYSTEM is doing off to
 * the side: syncs and print runs. The header's top-right reads it (Sync's spin
 * and panel, the print job cards); feeders write it at their choke points
 * (`printDocuments`, the label runs, the print-station host,
 * `sendStationJob`, the global sync client).
 *
 * A job that prints in units can be paused, resumed and cancelled: it declares
 * `controls`, and awaits `handle.checkpoint()` between units — the UI calls
 * {@link pauseWork} / {@link resumeWork} / {@link cancelWork}.
 *
 * Not "activity" — that name is the notifications inbox (`ActivityInbox`).
 */

import { useSyncExternalStore } from 'react';

export type WorkKind = 'sync' | 'print';
export type WorkStatus = 'running' | 'paused' | 'done' | 'failed' | 'cancelled';
/** What an operator can ask of a controllable job. */
export type WorkControl = 'pause' | 'resume' | 'cancel';

/** Which controls a job honours (a browser print dialog is one job: neither). */
export interface WorkControls {
  readonly pause: boolean;
  readonly cancel: boolean;
}

export interface WorkItem {
  readonly id: string;
  readonly kind: WorkKind;
  /** What is being worked on, as a noun phrase: "Zoho POs", "Location labels". */
  readonly label: string;
  readonly status: WorkStatus;
  readonly done?: number;
  readonly total?: number;
  /** The outcome in words, once finished (or why it failed). */
  readonly message?: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  /** Absent: the job cannot be paused or cancelled. */
  readonly controls?: WorkControls;
  /** Where the work lands, e.g. the print station's name. */
  readonly target?: string;
  /** A secondary identity, e.g. the FNSKU being printed. */
  readonly detail?: string;
}

export interface BackgroundWorkSnapshot {
  /** Newest first. Finished items linger {@link FINISHED_TTL_MS} for the dropdown. */
  readonly items: readonly WorkItem[];
}

export interface WorkHandle {
  readonly id: string;
  progress(done: number, total: number): void;
  finish(message?: string): void;
  fail(message: string): void;
  /**
   * Await between units: resolves `true` to go on (holding while paused),
   * `false` once cancelled — the job then stops and calls {@link cancelled}.
   */
  checkpoint(): Promise<boolean>;
  /** The job stopped because it was cancelled; `message` says what got done. */
  cancelled(message?: string): void;
  /** Mirror a pause decided elsewhere (a remote station's report) — no control is sent back. */
  setPaused(paused: boolean): void;
}

export interface BeginWorkInput {
  kind: WorkKind;
  label: string;
  total?: number;
  id?: string;
  controls?: WorkControls;
  target?: string;
  detail?: string;
  /**
   * Called when the UI pauses, resumes or cancels this item — a sender relays
   * it to the station actually printing. Local jobs obey through `checkpoint`.
   */
  onControl?: (control: WorkControl) => void;
}

/** A finished row stays in the dropdown this long. */
export const FINISHED_TTL_MS = 60_000;

const EMPTY: BackgroundWorkSnapshot = Object.freeze({ items: Object.freeze([]) });

let snapshot: BackgroundWorkSnapshot = EMPTY;
let sequence = 0;
const listeners = new Set<() => void>();
const pruneTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Checkpoints held by a pause, released `true` on resume / finish, `false` on cancel. */
const waiters = new Map<string, Set<(go: boolean) => void>>();
const controlRelays = new Map<string, (control: WorkControl) => void>();

/** Still in flight: running, or held by a pause. */
export function isLiveWork(status: WorkStatus): boolean {
  return status === 'running' || status === 'paused';
}

function commit(items: readonly WorkItem[]): void {
  snapshot = Object.freeze({ items: Object.freeze([...items]) });
  listeners.forEach((listener) => listener());
}

function patch(id: string, next: (item: WorkItem) => WorkItem | null): void {
  const index = snapshot.items.findIndex((item) => item.id === id);
  if (index < 0) return;
  const updated = next(snapshot.items[index]);
  if (!updated) return;
  const items = [...snapshot.items];
  items[index] = Object.freeze(updated);
  commit(items);
}

function release(id: string, go: boolean): void {
  const held = waiters.get(id);
  if (!held) return;
  waiters.delete(id);
  held.forEach((resolve) => resolve(go));
}

function remove(id: string): void {
  clearPrune(id);
  release(id, true);
  controlRelays.delete(id);
  if (!snapshot.items.some((item) => item.id === id)) return;
  commit(snapshot.items.filter((item) => item.id !== id));
}

function clearPrune(id: string): void {
  const timer = pruneTimers.get(id);
  if (timer === undefined) return;
  clearTimeout(timer);
  pruneTimers.delete(id);
}

function settle(id: string, status: Exclude<WorkStatus, 'running' | 'paused'>, message: string | undefined): void {
  const item = snapshot.items.find((other) => other.id === id);
  if (!item || !isLiveWork(item.status)) return;
  release(id, status !== 'cancelled');
  patch(id, (live) => ({ ...live, status, message, endedAt: Date.now() }));
  clearPrune(id);
  pruneTimers.set(id, setTimeout(() => remove(id), FINISHED_TTL_MS));
}

function setPaused(id: string, paused: boolean): boolean {
  const item = snapshot.items.find((other) => other.id === id);
  if (!item || item.status !== (paused ? 'running' : 'paused')) return false;
  patch(id, (live) => ({ ...live, status: paused ? 'paused' : 'running' }));
  if (!paused) release(id, true);
  return true;
}

/**
 * Start one piece of work. Passing the `id` of an item that is still in flight
 * joins it (the label and total refresh) instead of adding a second row — so
 * two feeders describing the same job never count it twice.
 */
export function beginWork(input: BeginWorkInput): WorkHandle {
  const id = input.id ?? `${input.kind}:${Date.now().toString(36)}:${(sequence += 1)}`;
  const existing = snapshot.items.find((item) => item.id === id);
  const described = {
    ...(input.controls ? { controls: Object.freeze({ ...input.controls }) } : {}),
    ...(input.target !== undefined ? { target: input.target } : {}),
    ...(input.detail !== undefined ? { detail: input.detail } : {}),
  };
  if (existing && isLiveWork(existing.status)) {
    patch(id, (item) => ({ ...item, ...described, label: input.label, total: input.total ?? item.total }));
  } else {
    clearPrune(id);
    release(id, true);
    const item: WorkItem = Object.freeze({
      id,
      kind: input.kind,
      label: input.label,
      status: 'running',
      ...(input.total !== undefined ? { done: 0, total: input.total } : {}),
      startedAt: Date.now(),
      ...described,
    });
    commit([item, ...snapshot.items.filter((other) => other.id !== id)]);
  }
  if (input.onControl) controlRelays.set(id, input.onControl);
  return {
    id,
    // A unit already in flight when a pause or cancel lands still counts.
    progress: (done, total) =>
      patch(id, (item) =>
        item.status !== 'done' && item.status !== 'failed' && (item.done !== done || item.total !== total)
          ? { ...item, done, total }
          : null,
      ),
    finish: (message) => settle(id, 'done', message),
    fail: (message) => settle(id, 'failed', message),
    checkpoint: () => {
      const item = snapshot.items.find((other) => other.id === id);
      if (item?.status === 'cancelled') return Promise.resolve(false);
      if (item?.status !== 'paused') return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        const held = waiters.get(id) ?? new Set();
        held.add(resolve);
        waiters.set(id, held);
      });
    },
    cancelled: (message) => {
      const item = snapshot.items.find((other) => other.id === id);
      if (item?.status === 'cancelled') {
        if (message !== undefined) patch(id, (settled) => ({ ...settled, message }));
      } else settle(id, 'cancelled', message ?? 'Cancelled');
    },
    setPaused: (paused) => void setPaused(id, paused),
  };
}

/** Hold a controllable job at its next checkpoint. */
export function pauseWork(id: string): void {
  const item = readWork(id);
  if (!item?.controls?.pause || !setPaused(id, true)) return;
  controlRelays.get(id)?.('pause');
}

/** Let a paused job go on. */
export function resumeWork(id: string): void {
  if (!setPaused(id, false)) return;
  controlRelays.get(id)?.('resume');
}

/** Stop a controllable job: its item is cancelled now; the job stops at its next checkpoint. */
export function cancelWork(id: string): void {
  const item = readWork(id);
  if (!item?.controls?.cancel || !isLiveWork(item.status)) return;
  settle(id, 'cancelled', 'Cancelled');
  controlRelays.get(id)?.('cancel');
}

/** Run `fn` as one piece of work: finished when it resolves, failed (and rethrown) when it throws. */
export async function trackWork<T>(
  kind: WorkKind,
  label: string,
  fn: (onProgress: (done: number, total: number) => void) => Promise<T>,
): Promise<T> {
  const work = beginWork({ kind, label });
  try {
    const result = await fn(work.progress);
    work.finish();
    return result;
  } catch (error) {
    work.fail(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/** The work item with this id, if it is still in the record. */
export function readWork(id: string): WorkItem | undefined {
  return snapshot.items.find((item) => item.id === id);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Call `onChange` whenever the item with this id changes (not for other items); returns the unsubscribe. */
export function watchWork(id: string, onChange: (item: WorkItem) => void): () => void {
  let last = readWork(id);
  return subscribe(() => {
    const next = readWork(id);
    if (next === last) return;
    last = next;
    if (next) onChange(next);
  });
}

const getSnapshot = (): BackgroundWorkSnapshot => snapshot;
const getServerSnapshot = (): BackgroundWorkSnapshot => EMPTY;

/** The frozen record; re-renders on every change. */
export function useBackgroundWork(): BackgroundWorkSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
