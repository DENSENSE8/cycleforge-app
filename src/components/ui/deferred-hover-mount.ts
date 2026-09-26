'use client';

/** Deferred activation — the ONE way a hover/focus surface stops paying for machinery nobody has reached for yet. */

import { useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';

/** Which interaction armed the surface. Focus opens instantly; hover may dwell. */
export type DeferredHoverIntent = 'hover' | 'focus';

export interface DeferredHoverBridge<H> {
  /**
   * Engine side: publish the live handle on mount, `null` on unmount. Once
   * attached, trigger interactions run against it directly and no further
   * re-render is needed.
   */
  attach: (handle: H | null) => void;
  /**
   * Engine side: the interaction that caused this mount, or `null` when the
   * operator left before the engine committed. Non-destructive — cleared by
   * `release`, so re-running a mount effect re-applies the same answer.
   */
  readIntent: () => DeferredHoverIntent | null;
}

export interface DeferredHoverMount<T extends HTMLElement, H> {
  /** True once armed (or `eager`). Never returns to false on its own. */
  mounted: boolean;
  /** Stable ref object for the trigger element — pass straight to `ref=`. */
  triggerRef: MutableRefObject<T | null>;
  /** Hand to the engine component. Stable for the life of the trigger. */
  bridge: DeferredHoverBridge<H>;
  /**
   * An activating interaction. Runs `run` against the live engine when one is
   * mounted; otherwise records `intent` and mounts it so the engine can carry
   * THIS interaction into its first commit.
   */
  activate: (intent: DeferredHoverIntent, run: (handle: H) => void) => void;
  /**
   * A de-activating interaction (pointer leave / blur). Clears any pending
   * intent — so a mount already in flight does not open behind the operator —
   * and runs `run` when the engine exists.
   */
  release: (run: (handle: H) => void) => void;
}

export function useDeferredHoverMount<T extends HTMLElement, H>({
  eager = false,
}: {
  /**
   * Bypass the deferral and mount the engine immediately. For props that must
   * be honoured before any interaction (a controlled `open`, an open-by-default
   * surface). Flipping it true later mounts the engine on that render.
   */
  eager?: boolean;
} = {}): DeferredHoverMount<T, H> {
  const [armed, setArmed] = useState(false);
  const selfRef = useRef<DeferredHoverMount<T, H> | null>(null);

  if (selfRef.current === null) {
    const state: { handle: H | null; intent: DeferredHoverIntent | null } = {
      handle: null,
      intent: null,
    };
    const triggerRef: MutableRefObject<T | null> = { current: null };
    const bridge: DeferredHoverBridge<H> = {
      attach: (handle) => {
        state.handle = handle;
      },
      readIntent: () => state.intent,
    };
    selfRef.current = {
      mounted: false,
      triggerRef,
      bridge,
      activate: (intent, run) => {
        state.intent = intent;
        if (state.handle) {
          run(state.handle);
          return;
        }
        setArmed(true);
      },
      release: (run) => {
        state.intent = null;
        if (state.handle) run(state.handle);
      },
    };
  }

  selfRef.current.mounted = armed || eager;
  return selfRef.current;
}

/** Engine side of {@link useDeferredHoverMount} — the mirror of `activate`. */
export function useDeferredHoverEngine<
  H extends Record<string, (...args: never[]) => void>,
>(
  bridge: DeferredHoverBridge<H>,
  handle: H,
  apply: (intent: DeferredHoverIntent, handle: H) => void,
): void {
  const latest = useRef({ handle, apply });
  latest.current = { handle, apply };

  useLayoutEffect(() => {
    const facade = {} as Record<string, (...args: never[]) => void>;
    for (const key of Object.keys(latest.current.handle)) {
      facade[key] = (...args: never[]) => latest.current.handle[key]?.(...args);
    }
    const stable = facade as H;
    bridge.attach(stable);
    const intent = bridge.readIntent();
    if (intent) latest.current.apply(intent, stable);
    return () => bridge.attach(null);
  }, [bridge]);
}
