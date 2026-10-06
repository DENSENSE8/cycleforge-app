'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Inbox } from '@/components/Icons';
import { AnchoredLayer } from '@/design-system/primitives';
import { ActivityInboxPopover } from '@/components/quick-access/ActivityInboxPopover';
import { HEADER_PILL_CLASS, TOP_CHROME_ICON_FACE } from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';

/**
 * The header's Inbox CTA on the shared pill face, and the panel it opens.
 */
export function ActivityInboxButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={anchorRef} className="flex h-full shrink-0 items-center px-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Inbox"
        aria-expanded={open}
        data-state={open ? 'open' : 'closed'}
        data-testid="global-inbox-button"
        className={HEADER_PILL_CLASS}
      >
        <Inbox className={cn(TOP_CHROME_ICON_FACE, 'size-4')} aria-hidden />
        <span>Inbox</span>
      </button>
      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        placement="bottom-end"
        gap={0}
        /**
         * The panel reaches the SCREEN edge, not the button's.
         * Operator 2026-09-22: *"the drop down for the inbox on click must have
         */
        edgeAlign="viewport"
      >
        <ActivityInboxPopover onClose={() => setOpen(false)} />
      </AnchoredLayer>
    </div>
  );
}
