'use client';

import { type ReactNode, useRef, useState } from 'react';
import { Loader2, Plus } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { cn } from '@/utils/_cn';
import {
  ComposerPlusMenuPanel,
} from '@/components/composer/ComposerPlusMenu';
import {
  NOTE_INSERT_MENU_ICON_CELL,
  NOTE_INSERT_MENU_ICON_TONE,
  NOTE_INSERT_MENU_ROW,
  NOTE_INSERT_TRIGGER_BTN,
  NOTE_INSERT_TRIGGER_BTN_ACTIVE,
  NOTE_INSERT_TRIGGER_COMPOSER_BTN,
  NOTE_INSERT_TRIGGER_COMPOSER_BTN_ACTIVE,
  NOTE_INSERT_TRIGGER_DOCK_BTN,
  NOTE_INSERT_TRIGGER_DOCK_BTN_ACTIVE,
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
 * Insert control for note composers. Faint `+` at rest; hover/open shows white
 * surface + gray ring. Menu uses the house dropdownPanel motion.
 *
 * @param placement — `overlay` (default) absolute corner; `inline` for
 *   OmnichannelComposerDock footer rows (no absolute positioning).
 * @param trigger — `chip` (default 22×22); `dock` = flush h-11 edge cell;
 *   `composer` = circular h-8 + in the station composer action bar.
 * @param className — absolute inset override when `placement="overlay"`.
 *   Default is {@link WORKSPACE_NESTED_OVERLAY_CORNER}.
 */
export function NoteComposerInsertRail({
  actions,
  className,
  placement = 'overlay',
  trigger: triggerVariant = 'chip',
}: {
  actions: NoteComposerInsertAction[];
  className?: string;
  placement?: 'overlay' | 'inline';
  trigger?: 'chip' | 'dock' | 'composer';
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Chip/overlay hide when empty; dock/composer always paint the + affordance.
  if (actions.length === 0 && triggerVariant !== 'dock' && triggerVariant !== 'composer') {
    return null;
  }

  const triggerIdle =
    triggerVariant === 'dock'
      ? NOTE_INSERT_TRIGGER_DOCK_BTN
      : triggerVariant === 'composer'
        ? NOTE_INSERT_TRIGGER_COMPOSER_BTN
        : NOTE_INSERT_TRIGGER_BTN;
  const triggerActive =
    triggerVariant === 'dock'
      ? NOTE_INSERT_TRIGGER_DOCK_BTN_ACTIVE
      : triggerVariant === 'composer'
        ? NOTE_INSERT_TRIGGER_COMPOSER_BTN_ACTIVE
        : NOTE_INSERT_TRIGGER_BTN_ACTIVE;
  const hasActions = actions.length > 0;

  const trigger = (
    <div
      className={cn(
        'pointer-events-auto',
        triggerVariant === 'dock' && 'h-11 w-11',
        triggerVariant === 'composer' && 'h-8 w-8',
      )}
    >
      <HoverTooltip label="Insert into note" asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={triggerVariant === 'composer' ? 'Add context' : 'Insert into note'}
          data-testid={triggerVariant === 'composer' ? 'composer-plus' : undefined}
          disabled={!hasActions}
          onClick={() => {
            if (!hasActions) return;
            setMenuOpen((open) => !open);
          }}
          className={cn(
            triggerIdle,
            menuOpen && triggerActive,
            !hasActions && 'cursor-not-allowed opacity-50',
          )}
        >
          <Plus className={NOTE_OVERLAY_ICON} />
        </button>
      </HoverTooltip>
      <ComposerPlusMenuPanel
        open={menuOpen && hasActions}
        onClose={() => setMenuOpen(false)}
        anchorRef={triggerRef}
        ariaLabel="Insert into note"
        data-testid={triggerVariant === 'composer' ? 'composer-plus-menu' : undefined}
        placement={
          placement === 'inline' || triggerVariant === 'dock' || triggerVariant === 'composer'
            ? 'top-start'
            : 'bottom-end'
        }
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
            className={NOTE_INSERT_MENU_ROW}
          >
            <span
              className={cn(
                NOTE_INSERT_MENU_ICON_CELL,
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
      </ComposerPlusMenuPanel>
    </div>
  );

  if (placement === 'inline' || triggerVariant === 'dock' || triggerVariant === 'composer') {
    return (
      <div
        className={cn(
          'relative shrink-0',
          triggerVariant === 'dock' && 'h-11 w-11',
          triggerVariant === 'composer' && 'h-8 w-8',
          className,
        )}
      >
        {trigger}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'pointer-events-none absolute z-10',
        WORKSPACE_NESTED_OVERLAY_CORNER,
        className,
      )}
    >
      {trigger}
    </div>
  );
}
