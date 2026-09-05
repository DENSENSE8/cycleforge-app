'use client';

/**
 * The **lead pane** every desk wears — published once by the app shell, read by
 * every {@link DeskPageChrome} underneath it.
 *
 * The composer sits on the LEFT of every desk, whatever the desk is. Wiring
 * that per desk meant every page that mounts the chrome had to remember to pass
 * it, and the ones that mount `DeskPageChrome` directly (Inventory, Photos,
 * Search, Walk-in, Incoming, the workspace views…) never did — so the mouth
 * appeared on the desks that went through `DeskPageLayout` and nowhere else.
 * An ambient pane makes the rule structural instead of remembered: mount the
 * chrome, get the column.
 *
 * Design-system file, so it carries a NODE and knows nothing about the
 * composer, permissions or routing — the app builds those and publishes the
 * result. A surface that must not have the column passes `leadPane={null}`
 * explicitly; an omitted prop takes the ambient pane.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';

export interface DeskLeadPane {
  /** The column's title, painted on the chrome's shared header row. */
  title: ReactNode;
  /** The column's body, mounted inside the one card left of the desk body. */
  node: ReactNode;
}

const DeskLeadPaneContext = createContext<DeskLeadPane | null>(null);

export function DeskLeadPaneProvider({
  title,
  node,
  children,
}: {
  title: ReactNode;
  node: ReactNode;
  children: ReactNode;
}) {
  const value = useMemo<DeskLeadPane>(() => ({ title, node }), [title, node]);
  return (
    <DeskLeadPaneContext.Provider value={value}>{children}</DeskLeadPaneContext.Provider>
  );
}

/** The ambient pane, or `null` where the shell published none. */
export function useDeskLeadPane(): DeskLeadPane | null {
  return useContext(DeskLeadPaneContext);
}
