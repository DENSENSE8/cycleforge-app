'use client';

/**
 * The ONE hover-open engine for chrome surfaces (tooltip panels, chip menus,
 * rail peeks, carton-bar classify menus). Owns exactly two things: *when* a
 * surface opens/closes, and *which* surface is allowed to be open.
 *
 * Positioning, portalling and chrome stay with the caller — this hook has no
 * opinion about where the surface renders, only about the timing contract.
 *
 * ## Timing — WMS, not consumer web
 *
 * An operator at a scan bench reaches for a cell on muscle memory. Any open
 * delay is artificial latency inserted between the eye and the data, so
 * {@link HOVER_DELAYS.OPEN_MS} is `0` and opening happens in the pointer event
 * itself — not `setTimeout(fn, 0)`, which still defers a task and costs a
 * visible frame on a bench monitor. There is no appear animation to match:
 * this row animates nothing.
 *
 * Closing is NOT symmetric. {@link HOVER_DELAYS.CLOSE_MS} exists only to bridge
 * the physical pixel gap between a trigger and its flush panel. Zero it and the
 * panel becomes unreachable — the pointer can never cross the seam.
 *
 * ## One at a time
 *
 * Opening evicts whatever is open. By default the registry is module-scope, so
 * a carton-bar menu evicts a rail peek and vice versa — different React trees,
 * one pointer, one answer on screen. Wrap a subtree in
 * {@link HoverSurfaceProvider} to scope the rule to that subtree instead.
 *
 * Deliberately no provider REQUIREMENT: this hook replaced three engines with
 * ~14 existing call sites across unrelated trees, and forcing every host to
 * mount a provider first would have made the migration a rewrite.
 *
 * ## Why closing is not driven by `mouseleave`
 *
 * `mouseleave` answers "was an element boundary crossed", which on dense flush
 * chrome fires for reasons unrelated to the operator moving: a portal mounting
 * under the cursor, a sibling tooltip painting, a `ResizeObserver` re-measuring
 * and shifting a cell by a pixel. Each of those emits leave→enter with the
 * pointer stationary, and a debounce on top of that is a flashing loop. Callers
 * that portal their surface should therefore prefer {@link isPointerInside} /
 * the `pointerover` guard in `surfaceProps` over raw leave events.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

/** The single timing contract. Never fork these into a component. */
export const HOVER_DELAYS = {
  /** Instant. The bench cannot afford hover-intent latency. */
  OPEN_MS: 0,
  /** Just enough to cross the seam from trigger to panel. */
  CLOSE_MS: 150,
} as const;

type Registry = {
  activeId: string | null;
  subscribers: Set<(activeId: string | null) => void>;
};

function createRegistry(): Registry {
  return { activeId: null, subscribers: new Set() };
}

function setActive(registry: Registry, id: string | null) {
  if (registry.activeId === id) return;
  registry.activeId = id;
  for (const notify of registry.subscribers) notify(id);
}

/** Module-scope default — used when no provider is mounted. */
const globalRegistry = createRegistry();

const HoverSurfaceContext = createContext<Registry | null>(null);

/**
 * Scope the one-at-a-time rule to a subtree. Optional: without it, surfaces
 * coordinate through the module-scope registry.
 */
export const HoverSurfaceProvider = HoverSurfaceContext.Provider;

/** Create a registry to hand to {@link HoverSurfaceProvider}. */
export { createRegistry as createHoverSurfaceRegistry };

/** True when `node` is inside the trigger or any open portal surface. */
export function isPointerInside(
  node: EventTarget | null,
  triggerEl: HTMLElement | null,
  surfaceSelector = '[data-hover-surface]',
): boolean {
  if (!(node instanceof Node)) return false;
  if (triggerEl?.contains(node)) return true;
  return node instanceof Element && node.closest(surfaceSelector) != null;
}

export function useHoverSurface({
  id,
  disabled = false,
  closeMs = HOVER_DELAYS.CLOSE_MS,
  onOpenChange,
}: {
  /** Stable identity. Omit and one is generated per instance. */
  id?: string;
  disabled?: boolean;
  closeMs?: number;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const generatedId = useId();
  const surfaceId = id ?? generatedId;
  const registry = useContext(HoverSurfaceContext) ?? globalRegistry;

  const [activeId, setActiveIdState] = useState<string | null>(registry.activeId);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    const notify = (next: string | null) => setActiveIdState(next);
    registry.subscribers.add(notify);
    setActiveIdState(registry.activeId);
    return () => {
      registry.subscribers.delete(notify);
    };
  }, [registry]);

  const isOpen = !disabled && activeId === surfaceId;

  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const wasOpen = useRef(isOpen);
  useEffect(() => {
    if (wasOpen.current === isOpen) return;
    wasOpen.current = isOpen;
    onOpenChangeRef.current?.(isOpen);
  }, [isOpen]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  /** 0ms — opens in THIS event, and evicts whatever else is open. */
  const open = useCallback(() => {
    if (disabled) return;
    clearCloseTimer();
    setActive(registry, surfaceId);
  }, [disabled, clearCloseTimer, registry, surfaceId]);

  /** Debounced — only closes if this surface still owns the slot. */
  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      if (registry.activeId === surfaceId) setActive(registry, null);
    }, closeMs);
  }, [clearCloseTimer, closeMs, registry, surfaceId]);

  /** Immediate — Escape, select, explicit dismiss. */
  const close = useCallback(() => {
    clearCloseTimer();
    if (registry.activeId === surfaceId) setActive(registry, null);
  }, [clearCloseTimer, registry, surfaceId]);

  // Disabling mid-hover (entering edit mode, losing a target) tears down now.
  useEffect(() => {
    if (disabled && registry.activeId === surfaceId) setActive(registry, null);
  }, [disabled, registry, surfaceId]);

  useEffect(
    () => () => {
      clearCloseTimer();
      if (registry.activeId === surfaceId) setActive(registry, null);
    },
    [clearCloseTimer, registry, surfaceId],
  );

  return {
    isOpen,
    surfaceId,
    open,
    close,
    scheduleClose,
    clearCloseTimer,
    /** Spread on the trigger. Focus events are omitted — the wedge owns focus. */
    triggerProps: {
      onMouseEnter: open,
      onMouseLeave: scheduleClose,
    },
    /**
     * Spread on the portal surface. Entering it cancels the pending close, so
     * the operator can cross the seam and use the panel.
     */
    surfaceProps: {
      'data-hover-surface': '' as const,
      onMouseEnter: clearCloseTimer,
      onMouseLeave: scheduleClose,
    },
  };
}
