'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Inbox } from '@/components/Icons';
import {
  AnchoredLayer,
  IconButton,
  type AnchoredPlacement,
  type IconButtonSize,
} from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { ActivityInboxPopover } from '@/components/quick-access/ActivityInboxPopover';
import { useActivityInboxOptional } from '@/contexts/ActivityInboxContext';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
} from '@/components/layout/header-shell';
import { cn } from '@/utils/_cn';

/**
 * The notifications button — glyph, unread corner count, and the panel it opens.
 *
 * Extracted from {@link GlobalHeaderActions} on 2026-08-21 so the mobile drawer
 * footer could mount the SAME control instead of re-deriving one. The face is
 * the shared header icon face in both places; only `placement` differs, because
 * a footer has room above it and a header has room below.
 *
 * The unread count lives here rather than at each call site — a second reader of
 * `useActivityInboxOptional().items.length` is how two surfaces come to disagree
 * about how many notifications there are.
 */
export function ActivityInboxButton({
  placement = 'bottom-end',
  size = 'md',
  iconClassName = TOP_CHROME_ICON_FACE,
  wrapClassName = HEADER_ICON_WRAP,
}: {
  placement?: AnchoredPlacement;
  size?: IconButtonSize;
  iconClassName?: string;
  wrapClassName?: string;
} = {}) {
  const pathname = usePathname();
  const inbox = useActivityInboxOptional();
  const count = inbox?.items.length ?? 0;
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={anchorRef} className={wrapClassName}>
      <HoverTooltip label="Notifications" asChild>
        <IconButton
          type="button"
          size={size}
          onClick={() => setOpen((o) => !o)}
          ariaLabel="Notifications"
          aria-expanded={open}
          className={cn(HEADER_ICON_BTN_CLASS, open && HEADER_ICON_BTN_OPEN_CLASS)}
          icon={
            <span className={cn('relative inline-flex shrink-0 items-center justify-center', iconClassName)}>
              <Inbox className={iconClassName} />
              {count > 0 && (
                <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-3 min-w-[12px] items-center justify-center rounded-full bg-rose-600 px-0.5 text-role-micro leading-none tabular-nums text-white ring-1 ring-white">
                  {count > 9 ? '9+' : count}
                </span>
              )}
            </span>
          }
        />
      </HoverTooltip>
      <AnchoredLayer
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        placement={placement}
        gap={0}
        /**
         * The panel reaches the SCREEN edge, not the button's.
         *
         * Operator 2026-09-22: *"the drop down for the inbox on click must have
         * no spacing to the right of the screen."* The header pads its icon
         * cluster (`HEADER_INSET_X`), so a trigger-aligned panel left that
         * inset standing as a gutter down the panel's right side — a strip of
         * page showing past a surface that is meant to hang off the corner.
         * The inbox is the last control on the beam, so its edge is the
         * screen's.
         */
        edgeAlign="viewport"
      >
        <ActivityInboxPopover onClose={() => setOpen(false)} />
      </AnchoredLayer>
    </div>
  );
}
