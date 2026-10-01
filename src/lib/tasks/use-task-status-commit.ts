'use client';

/**
 * One commit path for a task's status from the record screen — and ONE
 * optimistic state per task, shared by every control that shows it (owner
 * 2026-09-30: "optimistic updates must stick — the slider must never move by
 * itself back and forth"). The Overview row and the pinned footer each used to
 * carry their own optimism; after a drag they disagreed, and refetches landing
 * out of order (the board list and the desk query both feed this row) snapped
 * the face back and forth.
 *
 * Rules the store enforces:
 * 1. Writes are computed from the state the PREVIOUS write leaves behind and go
 *    one at a time (a bare hold while Done was still landing → 409).
 * 2. `lastWritten` is a high-water mark and is NEVER cleared. A row equal to it
 *    confirms our write (optimism rests). A row that differs from it is a
 *    pre-write response that resolved late, or a refetch echo of a state we
 *    moved through — ignored for {@link STALE_ROW_MS} after our last write.
 *    After that window a differing row is an external edit and wins.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import type { TaskDeskPatch } from '@/features/tasks/useTaskDesk';
import type { TaskDeskRow } from './task-desk-row';
import { TASK_HOLDS } from '@/design-system/tokens/task-status';
import { applyTaskStatusPatch, taskStatusOf, taskStatusPatch, type TaskStatusSource } from './task-status';
import type { TaskStatus } from '@/design-system/tokens/task-status';

/** How long after our last write a differing row counts as stale (echo / late response). */
const STALE_ROW_MS = 4000;

interface StatusEntry {
  /** The newest server row this task's controls have accepted. */
  source: TaskStatusSource;
  /** The optimistic face while our writes are unconfirmed; null at rest. */
  optimistic: TaskStatus | null;
  /** High-water: what our last queued write leaves behind. Never cleared. */
  lastWritten: TaskStatusSource | null;
  /** When the last write was queued — the staleness clock. */
  lastWriteAt: number;
  queue: Promise<unknown>;
  inFlight: number;
}

const entries = new Map<string, StatusEntry>();
const subscribers = new Set<() => void>();
let version = 0;

function emit(): void {
  version += 1;
  for (const notify of subscribers) notify();
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

function sameSource(a: TaskStatusSource, b: TaskStatusSource): boolean {
  return a.status === b.status && a.taskState === b.taskState;
}

function readSource(task: TaskDeskRow): TaskStatusSource {
  return { status: task.status, taskState: task.taskState ?? null };
}

/** A refetched row arrives: confirm, ignore as stale, or adopt as an external edit. */
function acceptRow(key: string, row: TaskStatusSource): void {
  const entry = entries.get(key);
  if (!entry) return;
  if (entry.lastWritten != null && sameSource(row, entry.lastWritten)) {
    // Our write landed: the optimism can rest, and the echo clock restarts.
    entry.source = row;
    entry.optimistic = null;
    entry.lastWriteAt = Date.now();
    emit();
    return;
  }
  const wroteRecently = Date.now() - entry.lastWriteAt < STALE_ROW_MS;
  if (entry.optimistic == null && !wroteRecently && !sameSource(entry.source, row)) {
    // No write of ours unconfirmed, nothing recent: an external edit wins.
    entry.source = row;
    emit();
  }
  // Else: the row predates or echoes our writes — stale, ignored.
}

/** A row read from a write response body, when the writer returned one. */
function sourceFromResponse(result: unknown): TaskStatusSource | null {
  if (result == null || typeof result !== 'object' || !('task' in result)) return null;
  const task = result.task;
  if (task == null || typeof task !== 'object' || !('status' in task) || typeof task.status !== 'string') return null;
  const rawState: unknown = Reflect.get(task, 'taskState');
  const hold = typeof rawState === 'string' ? TASK_HOLDS.find((h) => h === rawState) : undefined;
  return { status: task.status as TaskStatusSource['status'], taskState: hold ?? null };
}

export function useTaskStatusCommit(
  task: TaskDeskRow,
  onPatch: (patch: TaskDeskPatch) => Promise<unknown>,
): { current: TaskStatus; pending: boolean; setStatus: (target: TaskStatus) => void } {
  const key = String(task.id);
  const row = readSource(task);

  if (!entries.has(key)) {
    entries.set(key, { source: row, optimistic: null, lastWritten: null, lastWriteAt: 0, queue: Promise.resolve(), inFlight: 0 });
  }
  const entryRef = useRef(entries.get(key)!);

  useEffect(() => {
    acceptRow(key, readSource(task));
  }, [key, task.status, task.taskState]);

  useSyncExternalStore(subscribe, () => version, () => version);

  const setStatus = useCallback(
    (target: TaskStatus) => {
      const entry = entries.get(key);
      if (!entry) return;
      const base = entry.lastWritten ?? entry.source;
      const patch = taskStatusPatch(base, target);
      if (!patch) return;
      entry.lastWritten = applyTaskStatusPatch(base, patch);
      entry.lastWriteAt = Date.now();
      entry.optimistic = target;
      entry.inFlight += 1;
      emit();
      entry.queue = entry.queue
        .then(() => onPatch(patch))
        .then((result: unknown) => {
          // The writer returns the saved row: confirm from the response itself,
          // so the face never waits on (or trusts) a refetch race.
          const confirmed = sourceFromResponse(result);
          if (confirmed) acceptRow(key, confirmed);
          return result;
        })
        .catch((error: unknown) => {
          // The write failed: the newest accepted row stands, never a stale mid-flight one.
          entry.optimistic = null;
          emit();
          toast.error(error instanceof Error ? error.message : 'Could not change the status.');
        })
        .finally(() => {
          entry.inFlight -= 1;
        });
    },
    [key, onPatch],
  );

  const current = entryRef.current.optimistic ?? taskStatusOf(entryRef.current.source);
  return { current, pending: entryRef.current.optimistic != null, setStatus };
}
