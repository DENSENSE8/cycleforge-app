'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Inbox } from '@/components/Icons';
import { AnchoredLayer } from '@/design-system/primitives';
import { ActivityInboxPopover } from '@/components/quick-access/ActivityInboxPopover';
import { useActivityInboxOptional } from '@/contexts/ActivityInboxContext';
import { HEADER_PILL_CLASS, TOP_CHROME_ICON_FACE } from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';

/**
 * The header's Inbox CTA — `[inbox] Inbox 3` on the shared pill face (owner
 * 2026-09-28: Add · Inbox · Sync are all labelled CTAs), and the panel it opens.
 */
export function ActivityInboxButton() {
  const pathname = usePathname();
  const inbox = useActivityInboxOptional();
  const count = inbox?.items.length ?? 0;
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
        aria-label={count > 0 ? `Inbox — ${count} new` : 'Inbox'}
        aria-expanded={open}
        data-state={open ? 'open' : 'closed'}
        data-testid="global-inbox-button"
        className={HEADER_PILL_CLASS}
      >
        <Inbox className={cn(TOP_CHROME_ICON_FACE, 'size-4')} aria-hidden />
        <span>Inbox</span>
        {count > 0 ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-mode-pill bg-rose-600 px-1 text-role-micro leading-none tabular-nums text-white">
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
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
