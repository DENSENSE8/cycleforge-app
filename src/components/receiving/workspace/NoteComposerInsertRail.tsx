'use client';

import { type ReactNode, useRef, useState } from 'react';
import { Loader2, Plus } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Popover } from '@/design-system/primitives/Popover';
import { cn } from '@/utils/_cn';
import {
  NOTE_INSERT_MENU_ICON_TONE,
  NOTE_INSERT_TRIGGER_BTN,
  NOTE_INSERT_TRIGGER_BTN_ACTIVE,
  NOTE_OVERLAY_ICON,
} from './note-composer-helpers';
import { WORKSPACE_NESTED_OVERLAY_CORNER } from '@/design-system/components';

export type NoteComposerInsertAction = {
  id: string;
  label: string;
  ariaLabel: string;
  icon: ReactNode;
  /** Kept for call-site compatibility; menu uses {@link NOTE_INSERT_MENU_ICON_TONE}. */
  buttonClassName: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
};

/**
 * Top-right insert control for note composers. Faint `+` at rest; hover/open
 * shows white surface + gray ring with a visible gray glyph. Menu uses the
 * house dropdownPanel motion.
 *
 * @param className — absolute inset override. Default is
 *   {@link WORKSPACE_NESTED_OVERLAY_CORNER}; compact 50px Notes pins with
 *   {@link WORKSPACE_NESTED_OVERLAY_CORNER_COMPACT}.
 */
export function NoteComposerInsertRail({
  actions,
  className,
}: {
  actions: NoteComposerInsertAction[];
  className?: string;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  if (actions.length === 0) return null;

  return (
    <div
      className={cn(
        'pointer-events-none absolute z-10',
        WORKSPACE_NESTED_OVERLAY_CORNER,
        className,
      )}
    >
      <div className="pointer-events-auto">
        <HoverTooltip label="Insert into note" asChild>
          {/* ds-raw-button */}
          <button
            ref={triggerRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Insert into note"
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(NOTE_INSERT_TRIGGER_BTN, menuOpen && NOTE_INSERT_TRIGGER_BTN_ACTIVE)}
          >
            <Plus className={NOTE_OVERLAY_ICON} />
          </button>
        </HoverTooltip>
        <Popover
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          anchorRef={triggerRef}
          placement="bottom-end"
          level="panelOverlay"
          role="menu"
          aria-label="Insert into note"
          padded={false}
          className="w-56 p-1"
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              disabled={action.disabled || action.loading}
              onClick={() => {
                action.onClick();
                setMenuOpen(false);
              }}
              className="ds-raw-button flex w-full items-center gap-2 rounded-md border-0 px-2 py-1.5 text-left text-role-caption font-semibold text-text-muted shadow-none outline-none transition-colors hover:bg-surface-hover hover:text-text-default disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span
                className={cn(
                  'inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center',
                  NOTE_INSERT_MENU_ICON_TONE[action.id] ?? 'text-text-muted',
                )}
                aria-hidden
              >
                {action.loading ? (
                  <Loader2 className={`${NOTE_OVERLAY_ICON} animate-spin`} />
                ) : (
                  action.icon
                )}
              </span>
              <span className="min-w-0 flex-1 truncate">{action.label}</span>
            </button>
          ))}
        </Popover>
      </div>
    </div>
  );
}
