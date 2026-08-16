/**
 * Native capture-phase HID wedge listener.
 *
 * SoT for barcode-wedge input. React's synthetic event system is the wrong
 * altitude: a scan of 20 chars + Enter must never enter a fiber, and the
 * keydown handler must return before `onScan` (React state, routing, sink
 * dispatch) runs. This factory:
 *
 *  1. Classifies keys via the pure {@link wedgeReduce} machine.
 *  2. Enqueues accepted payloads on {@link createScanCommitQueue}.
 *  3. Yields the main thread before `onScan` so the next wedge char lands.
 *  4. Never reads or writes focus.
 *
 * {@link useWedgeScanner} is the React mount adapter — tests drive *this*
 * function, not the hook.
 */

import { isEditableKeyTarget } from '@/lib/keyboard/is-editable-key-target';
import {
  WEDGE_IDLE,
  WEDGE_IDLE_FLUSH_MS,
  WEDGE_MAX_INTER_KEY_MS,
  WEDGE_MIN_LENGTH,
  wedgeReduce,
  wedgeValueAcceptable,
  type WedgeScanState,
} from '@/lib/keyboard/wedge-scan-machine';
import { createScanCommitQueue } from '@/lib/perf/scan-commit-queue';
import type { YieldToInputDeps } from '@/lib/perf/yield-to-input';

export interface WedgeKeyEvent {
  key: string;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  timeStamp: number;
  target: EventTarget | null;
  preventDefault: () => void;
}

export interface CreateWedgeKeyListenerOptions {
  onScan: (value: string) => void;
  maxInterKeyMs?: number;
  idleFlushMs?: number;
  minLength?: number;
  isEditable?: (target: EventTarget | null) => boolean;
  yieldToInput?: (deps?: YieldToInputDeps) => Promise<void>;
  now?: () => number;
  scheduleIdle?: (fn: () => void, ms: number) => number;
  cancelIdle?: (id: number) => void;
}

export interface WedgeKeyListener {
  onKeyDown: (event: WedgeKeyEvent) => void;
  dispose: () => void;
  pendingCount: () => number;
  flush: () => Promise<void>;
}

export function createWedgeKeyListener(
  opts: CreateWedgeKeyListenerOptions,
): WedgeKeyListener {
  const maxInterKeyMs = opts.maxInterKeyMs ?? WEDGE_MAX_INTER_KEY_MS;
  const idleFlushMs = opts.idleFlushMs ?? WEDGE_IDLE_FLUSH_MS;
  const minLength = opts.minLength ?? WEDGE_MIN_LENGTH;
  const isEditable = opts.isEditable ?? isEditableKeyTarget;
  const now = opts.now ?? (() => performance.now());
  const scheduleIdle =
    opts.scheduleIdle ?? ((fn, ms) => window.setTimeout(fn, ms));
  const cancelIdle = opts.cancelIdle ?? ((id) => window.clearTimeout(id));

  let state: WedgeScanState = WEDGE_IDLE;
  let flushTimer: number | null = null;
  const queue = createScanCommitQueue({
    onScan: opts.onScan,
    yieldToInput: opts.yieldToInput,
  });

  function clearIdle(): void {
    if (flushTimer == null) return;
    cancelIdle(flushTimer);
    flushTimer = null;
  }

  function commitValue(value: string): void {
    clearIdle();
    state = WEDGE_IDLE;
    if (wedgeValueAcceptable(value, minLength)) queue.enqueue(value);
  }

  function armIdle(): void {
    clearIdle();
    flushTimer = scheduleIdle(() => {
      flushTimer = null;
      const value = state.buffer.trim();
      state = WEDGE_IDLE;
      if (wedgeValueAcceptable(value, minLength)) queue.enqueue(value);
    }, idleFlushMs);
  }

  function onKeyDown(event: WedgeKeyEvent): void {
    const step = wedgeReduce(
      state,
      {
        key: event.key,
        altKey: event.altKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        timeStamp: event.timeStamp || now(),
        editable: isEditable(event.target),
      },
      { maxInterKeyMs, minLength },
    );
    state = step.state;

    if (step.kind === 'commit') {
      event.preventDefault();
      commitValue(step.value);
      return;
    }
    if (step.kind === 'append') {
      armIdle();
      return;
    }
    if (step.kind === 'reset') {
      clearIdle();
    }
  }

  return {
    onKeyDown,
    dispose() {
      clearIdle();
    },
    pendingCount: queue.pendingCount,
    flush: queue.flush,
  };
}

/**
 * Bind {@link createWedgeKeyListener} to `window` at capture phase.
 * Returns a disposer that removes the listener and cancels idle flush.
 */
export function attachWedgeKeyListener(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  opts: CreateWedgeKeyListenerOptions,
): () => void {
  const listener = createWedgeKeyListener(opts);
  const onKeyDown = (event: Event) => {
    listener.onKeyDown(event as KeyboardEvent);
  };
  target.addEventListener('keydown', onKeyDown, true);
  return () => {
    target.removeEventListener('keydown', onKeyDown, true);
    listener.dispose();
  };
}
