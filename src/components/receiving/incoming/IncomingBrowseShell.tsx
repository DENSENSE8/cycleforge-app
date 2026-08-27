'use client';

/**
 * Client shell for `/incoming` — SSR paints {@link IncomingFirstPaint} (neutral
 * canvas). After hydration the real workbench mounts in normal flex flow so the
 * sheet grid owns a definite Y scroll port (Playwright + the virtualizer both
 * target `incoming-grid-body-scroll`). An absolute overlay over the stand-in
 * broke that flex chain and left the table at min-height.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { IncomingFirstPaint } from '@/components/receiving/incoming/IncomingFirstPaint';

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
      {children}
    </div>
  );
}
