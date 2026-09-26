'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

/** Sidebar rail "edit mode" — the pencil-toggle multi-select flow. */
export interface RailEditMode {
  /** Provider mounted — rails surface the eyebrow pencil toggle. */
  enabled: boolean;
  /** True while the pencil toggle is on — rails render checkboxes. */
  active: boolean;
  /** Checked row ids (the rail's `getId` values). */
  selectedIds: ReadonlySet<number>;
  /** Check/uncheck a row id. */
  toggle: (id: number) => void;
  /** Set a batch of ids checked/unchecked at once — shift-click range select. */
  setMany: (ids: number[], checked: boolean) => void;
  /** Pencil press — flip edit mode on/off. */
  toggleActive: () => void;
}

const DISABLED: RailEditMode = {
  enabled: false,
  active: false,
  selectedIds: new Set<number>(),
  toggle: () => {},
  setMany: () => {},
  toggleActive: () => {},
};

const RailEditModeContext = createContext<RailEditMode>(DISABLED);

export function useRailEditMode(): RailEditMode {
  return useContext(RailEditModeContext);
}

export function RailEditModeProvider({
  active,
  selectedIds,
  toggle,
  setMany,
  toggleActive,
  children,
}: Omit<RailEditMode, 'enabled'> & { children: ReactNode }) {
  const value = useMemo(
    () => ({ enabled: true, active, selectedIds, toggle, setMany, toggleActive }),
    [active, selectedIds, toggle, setMany, toggleActive],
  );
  return (
    <RailEditModeContext.Provider value={value}>
      {children}
    </RailEditModeContext.Provider>
  );
}
