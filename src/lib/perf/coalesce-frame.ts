/** rAF coalescer — collapse a burst of Ably messages into one apply per frame. */

export type FrameCoalesceMode = 'last' | 'all';

export interface FrameCoalescer<T> {
  push: (item: T) => void;
  dispose: () => void;
  pendingCount: () => number;
}

export interface CreateFrameCoalescerOptions<T> {
  flush: (batch: T[]) => void;
  mode?: FrameCoalesceMode;
  raf?: (cb: FrameRequestCallback) => number;
  caf?: (id: number) => void;
}

export function createFrameCoalescer<T>(
  opts: CreateFrameCoalescerOptions<T>,
): FrameCoalescer<T> {
  const mode = opts.mode ?? 'last';
  const raf =
    opts.raf ??
    ((cb) => {
      if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
      return setTimeout(() => cb(0), 16) as unknown as number;
    });
  const caf =
    opts.caf ??
    ((id) => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      else clearTimeout(id);
    });

  let pending: T[] = [];
  let frame: number | null = null;

  function schedule(): void {
    if (frame != null) return;
    frame = raf(() => {
      frame = null;
      const batch = pending;
      pending = [];
      if (batch.length === 0) return;
      try {
        opts.flush(mode === 'last' ? batch.slice(-1) : batch);
      } catch {
        /* handler errors must not kill the coalescer */
      }
    });
  }

  return {
    push(item: T) {
      pending.push(item);
      schedule();
    },
    dispose() {
      if (frame != null) caf(frame);
      frame = null;
      pending = [];
    },
    pendingCount: () => pending.length,
  };
}
