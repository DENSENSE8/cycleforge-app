'use client';

/**
 * Global header Find — icon-only trigger on the right rail (left of Add).
 * Opens the centered {@link CommandBar} palette via {@link COMMAND_BAR_OPEN_EVENT}.
 * Does not own ⌘K — that chord lives on CommandBar.
 */

import { useEffect, useState } from 'react';
import { Search } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import {
  COMMAND_BAR_OPEN_CHANGE_EVENT,
  COMMAND_BAR_OPEN_EVENT,
} from '@/lib/app-events';
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
} from './header-shell';

export function GlobalHeaderSearch() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      if (typeof detail?.open === 'boolean') setOpen(detail.open);
    };
    window.addEventListener(COMMAND_BAR_OPEN_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(COMMAND_BAR_OPEN_CHANGE_EVENT, onChange);
  }, []);

  return (
    <div className={HEADER_ICON_WRAP} data-testid="global-find-field">
      <IconButton
        type="button"
        size="md"
        ariaLabel="Search"
        title="Search (⌘K)"
        aria-expanded={open}
        onClick={() => window.dispatchEvent(new Event(COMMAND_BAR_OPEN_EVENT))}
        className={cn(HEADER_ICON_BTN_CLASS, open && HEADER_ICON_BTN_OPEN_CLASS)}
        icon={<Search className={TOP_CHROME_ICON_FACE} aria-hidden />}
      />
    </div>
  );
}
