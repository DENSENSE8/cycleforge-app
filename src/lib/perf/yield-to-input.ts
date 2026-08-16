/**
 * Yield the main thread so the browser can handle pending input (INP).
 *
 * Warehouse wedges fire the next keydown within ~8–20ms of the previous
 * commit. If we stay on the keydown stack to run React work, that next
 * keystroke is delayed and INP goes red. `scheduler.yield()` (when present)
 * is the platform primitive; MessageChannel is the portable macrotask
 * fallback. `queueMicrotask` is NOT a yield — it stays in the same task.
 *
 * Inject `deps` in tests. Production callers use the default.
 */

export interface YieldToInputDeps {
  /** Override `scheduler.yield`. `null` forces the macrotask fallback. */
  schedulerYield?: (() => Promise<void>) | null;
  /** Override the macrotask scheduler (MessageChannel / setTimeout). */
  scheduleMacrotask?: (fn: () => void) => void;
}

function nativeSchedulerYield(): (() => Promise<void>) | null {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } })
    .scheduler;
  return typeof scheduler?.yield === 'function' ? () => scheduler.yield!() : null;
}

function scheduleMacrotask(fn: () => void): void {
  if (typeof MessageChannel === 'function') {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.onmessage = null;
      channel.port1.close();
      channel.port2.close();
      fn();
    };
    channel.port2.postMessage(null);
    return;
  }
  setTimeout(fn, 0);
}

/**
 * Park the current task until the browser has had a chance to drain input.
 * Never call this from inside a `keydown` handler's synchronous body —
 * schedule it *after* the handler returns so the next wedge char can land.
 */
export async function yieldToInput(deps: YieldToInputDeps = {}): Promise<void> {
  const schedulerYield =
    deps.schedulerYield === undefined ? nativeSchedulerYield() : deps.schedulerYield;
  if (schedulerYield) {
    await schedulerYield();
    return;
  }
  await new Promise<void>((resolve) => {
    (deps.scheduleMacrotask ?? scheduleMacrotask)(resolve);
  });
}
