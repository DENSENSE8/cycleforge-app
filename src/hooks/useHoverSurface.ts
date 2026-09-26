'use client';

/** The ONE hover-open engine for chrome surfaces (tooltip panels, chip menus, rail peeks, carton-bar classify menus). */

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

  /** Does the REGISTRY say this surface owns the slot right now? */
  const isActive = useCallback(
    () => !disabled && registry.activeId === surfaceId,
    [disabled, registry, surfaceId],
  );

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
    isActive,
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
