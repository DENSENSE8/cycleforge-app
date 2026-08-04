'use client';

/**
 * Lets route context panels (e.g. Unbox Recent filter footer) write the same
 * {@link CONTEXT_PANEL_COLLAPSE} preference owned by {@link ContextPanelLayout}
 * — without prop-drilling through `SidebarContextPanel`.
 */

import { createContext, useContext, type ReactNode } from 'react';

type ContextPanelCollapseApi = {
  /** Park the left context rail (operator preference). */
  collapse: () => void;
};

const ContextPanelCollapseContext = createContext<ContextPanelCollapseApi | null>(
  null,
);

export function ContextPanelCollapseProvider({
  collapse,
  children,
}: {
  collapse: () => void;
  children: ReactNode;
}) {
  return (
    <ContextPanelCollapseContext.Provider value={{ collapse }}>
      {children}
    </ContextPanelCollapseContext.Provider>
  );
}

/** Returns null when no context panel is mounted (panel-less routes). */
export function useContextPanelCollapse(): ContextPanelCollapseApi | null {
  return useContext(ContextPanelCollapseContext);
}
