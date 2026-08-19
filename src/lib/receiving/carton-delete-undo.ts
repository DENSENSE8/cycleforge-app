/**
 * Delayed carton hard-delete with an undo window (Gmail send-undo).
 *
 * `receiving_carton` DELETE is irreversible on the server, so the HTTP
 * commit waits {@link CARTON_DELETE_UNDO_MS}. Optimistic rail hide happens
 * immediately; Undo cancels the timer and restores the snapshot.
 */

export const CARTON_DELETE_UNDO_MS = 10_000;

export type CartonDeleteUndoClock = {
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (id: ReturnType<typeof setTimeout>) => void;
};

type PendingCartonDelete = {
  timer: ReturnType<typeof setTimeout>;
  commit: () => void | Promise<void>;
  status: 'pending' | 'committing';
};

const pending = new Map<number, PendingCartonDelete>();

const defaultClock: CartonDeleteUndoClock = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};

let pagehideBound = false;

function bindPagehideFlush(): void {
  if (pagehideBound || typeof window === 'undefined') return;
  pagehideBound = true;
  window.addEventListener('pagehide', () => {
    void flushAllPendingCartonDeletes();
  });
}

export function hasPendingCartonDelete(receivingId: number): boolean {
  return pending.get(receivingId)?.status === 'pending';
}

export function scheduleCartonDeleteUndo(
  receivingId: number,
  commit: () => void | Promise<void>,
  opts?: { ms?: number; clock?: CartonDeleteUndoClock },
): void {
  const clock = opts?.clock ?? defaultClock;
  const existing = pending.get(receivingId);
  if (existing) {
    clock.clearTimeout(existing.timer);
    pending.delete(receivingId);
  }
  bindPagehideFlush();
  const entry: PendingCartonDelete = {
    timer: clock.setTimeout(() => {
      void flushCartonDelete(receivingId);
    }, opts?.ms ?? CARTON_DELETE_UNDO_MS),
    commit,
    status: 'pending',
  };
  pending.set(receivingId, entry);
}

/** Cancel a pending commit. Returns false if already flushing or missing. */
export function undoCartonDelete(
  receivingId: number,
  clock: CartonDeleteUndoClock = defaultClock,
): boolean {
  const entry = pending.get(receivingId);
  if (!entry || entry.status !== 'pending') return false;
  clock.clearTimeout(entry.timer);
  pending.delete(receivingId);
  return true;
}

export async function flushCartonDelete(receivingId: number): Promise<void> {
  const entry = pending.get(receivingId);
  if (!entry || entry.status !== 'pending') return;
  entry.status = 'committing';
  try {
    await entry.commit();
  } finally {
    pending.delete(receivingId);
  }
}

async function flushAllPendingCartonDeletes(): Promise<void> {
  const ids = [...pending.keys()];
  await Promise.all(ids.map((id) => flushCartonDelete(id)));
}

/** Test helper — drop pending timers without committing. */
export function resetCartonDeleteUndoForTests(
  clock: CartonDeleteUndoClock = defaultClock,
): void {
  for (const entry of pending.values()) {
    clock.clearTimeout(entry.timer);
  }
  pending.clear();
}
