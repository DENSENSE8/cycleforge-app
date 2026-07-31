'use client';

/**
 * Host-owned ticket photo staging for station Ticket tabs.
 * {@link SupportTicketFocus} / Testing provide the bag; {@link SupportTicketDetail}
 * reads it when `composerPlacement="host"` so the drop overlay and floating
 * composer share one staging instance without rebuilding section tabs.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { TicketPhotoStaging } from '@/hooks/useTicketPhotoStaging';

const TicketComposerStagingContext = createContext<TicketPhotoStaging | null>(null);

export function TicketComposerStagingProvider({
  value,
  children,
}: {
  value: TicketPhotoStaging;
  children: ReactNode;
}) {
  return (
    <TicketComposerStagingContext.Provider value={value}>
      {children}
    </TicketComposerStagingContext.Provider>
  );
}

/** Host staging when inside {@link TicketComposerStagingProvider}; else null. */
export function useTicketComposerStaging(): TicketPhotoStaging | null {
  return useContext(TicketComposerStagingContext);
}
