'use client';

/** Client shell for `/incoming` — SSR paints {@link IncomingFirstPaint} (neutral canvas). */

import { useEffect, useState, type ReactNode } from 'react';
import { IncomingFirstPaint } from '@/components/receiving/incoming/IncomingFirstPaint';
import { IncomingDeskAddAction } from '@/components/receiving/incoming/IncomingDeskAddAction';

export function IncomingBrowseShell({ children }: { children: ReactNode }) {
  const [live, setLive] = useState(false);
  useEffect(() => {
    setLive(true);
  }, []);

  if (!live) {
    return <IncomingFirstPaint className="min-h-0 flex-1" />;
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
      <IncomingDeskAddAction />
      {children}
    </div>
  );
}
