'use client';

/**
 * Client shell for `/incoming` — SSR paints {@link IncomingFirstPaint} (real
 * text, so it can own LCP). The interactive workbench mounts after hydration
 * the same way `UnboxBrowseShell` holds the carton skeleton: children stay
 * out of the first HTML face so Speed Index is the stand-in, not an empty
 * wash covering it.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { IncomingFirstPaint } from '@/components/receiving/incoming/IncomingFirstPaint';
import { cn } from '@/utils/_cn';

export function IncomingBrowseShell({ children }: { children: ReactNode }) {
  const [live, setLive] = useState(false);
  useEffect(() => {
    setLive(true);
  }, []);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col">
      <IncomingFirstPaint className="min-h-0 flex-1" />
      <div
        className={cn(
          'absolute inset-0 z-10 flex min-h-0 w-full flex-1 flex-col',
          !live && 'hidden',
        )}
      >
        {children}
      </div>
    </div>
  );
}
