'use client';

/** Leaf detail disclosure open state — one open id per provider, local fallback. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  COMPOUND_ROW_DETAIL_EXPANDED_PX,
  COMPOUND_ROW_PX,
} from './compound-row-chrome';

type DetailOpenApi = {
  openId: string | null;
  setOpenId: (id: string | null) => void;
};

const CompoundRowDetailContext = createContext<DetailOpenApi | null>(null);

/** Open leaf ids — virtualizer first-paint estimate (measureElement still corrects). */
const openDetailIds = new Set<string>();
const openListeners = new Set<() => void>();

function publishOpenIds() {
  for (const listener of openListeners) listener();
}

function setDetailOpenTracked(rowId: string, open: boolean) {
  const before = openDetailIds.has(rowId);
  if (open) openDetailIds.add(rowId);
  else openDetailIds.delete(rowId);
  if (before !== open) publishOpenIds();
}

/** True when this leaf (or any leaf whose id appears in the virtual key) is expanded. */
export function isCompoundRowDetailOpen(rowIdOrKey: string): boolean {
  if (openDetailIds.has(rowIdOrKey)) return true;
  for (const id of openDetailIds) {
    if (rowIdOrKey.includes(id)) return true;
  }
  return false;
}

/** First-paint estimate: 96 when this item’s leaf is open, else the idle compound box. */
export function compoundRowDetailEstimatePx(
  rowIdOrKey: string,
  idlePx: number = COMPOUND_ROW_PX,
): number {
  return isCompoundRowDetailOpen(rowIdOrKey)
    ? Math.max(idlePx, COMPOUND_ROW_DETAIL_EXPANDED_PX)
    : idlePx;
}

export function subscribeCompoundRowDetailOpen(listener: () => void): () => void {
  openListeners.add(listener);
  return () => {
    openListeners.delete(listener);
  };
}

export function CompoundRowDetailProvider({ children }: { children: ReactNode }) {
  const [openId, setOpenIdState] = useState<string | null>(null);
  const setOpenId = useCallback((id: string | null) => {
    setOpenIdState((prev) => {
      if (prev) setDetailOpenTracked(prev, false);
      if (id) setDetailOpenTracked(id, true);
      return id;
    });
  }, []);
  const value = useMemo(() => ({ openId, setOpenId }), [openId, setOpenId]);
  return (
    <CompoundRowDetailContext.Provider value={value}>
      {children}
    </CompoundRowDetailContext.Provider>
  );
}

export function useCompoundRowDetail(rowId: string): {
  open: boolean;
  toggle: () => void;
  close: () => void;
} {
  const ctx = useContext(CompoundRowDetailContext);
  const [localOpen, setLocalOpen] = useState(false);

  useEffect(() => {
    if (ctx) return;
    setDetailOpenTracked(rowId, localOpen);
    return () => setDetailOpenTracked(rowId, false);
  }, [ctx, localOpen, rowId]);

  const open = ctx ? ctx.openId === rowId : localOpen;

  const toggle = useCallback(() => {
    if (ctx) {
      ctx.setOpenId(ctx.openId === rowId ? null : rowId);
      return;
    }
    setLocalOpen((prev) => !prev);
  }, [ctx, rowId]);

  const close = useCallback(() => {
    if (ctx) {
      if (ctx.openId === rowId) ctx.setOpenId(null);
      return;
    }
    setLocalOpen(false);
  }, [ctx, rowId]);

  return { open, toggle, close };
}
