'use client';

/**
 * Hover-under-chip secondary action menu — SoT for dense table identity chips
 * and (via thin adapters) unbox carton chips.
 *
 * Pattern (IdentityLinkChip / SerialChipWithMenu):
 *   • Chip click = primary (copy or open) — parent supplies the chip child.
 *   • Hover the group → menu below chip (`z-panelPopover`).
 *   • stopPropagation so table rows don't open detail on menu clicks.
 */

import { useState, type ReactNode } from 'react';
import { cn } from '@/utils/_cn';

export type CopyChipHoverMenuItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Destructive rows (delete) use rose tone. */
  tone?: 'default' | 'accent' | 'danger';
};

export function CopyChipHoverMenu({
  children,
  items,
  menuLabel,
  className,
}: {
  children: ReactNode;
  items: CopyChipHoverMenuItem[];
  menuLabel: string;
  className?: string;
}) {
  const [menuHover, setMenuHover] = useState(false);
  const enabled = items.length > 0;

  return (
    <div
      className={cn('group relative inline-flex shrink-0 items-center', className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onMouseEnter={() => {
        if (enabled) setMenuHover(true);
      }}
      onMouseLeave={() => setMenuHover(false)}
    >
      {children}
      {enabled ? (
        <div
          className={cn(
            'absolute left-1/2 top-full z-panelPopover -translate-x-1/2 pt-1 transition-opacity duration-100',
            menuHover
              ? 'visible pointer-events-auto opacity-100'
              : 'invisible pointer-events-none opacity-0',
          )}
        >
          <div
            role="menu"
            aria-label={menuLabel}
            className="min-w-[140px] overflow-hidden rounded-lg border border-border-soft bg-surface-card shadow-lg"
          >
            {items.map((item, i) => {
              const toneClass =
                item.tone === 'danger'
                  ? 'text-rose-600 hover:bg-rose-50'
                  : item.tone === 'accent'
                    ? 'text-blue-700 hover:bg-blue-50'
                    : 'text-text-muted hover:bg-surface-hover';
              const iconClass =
                item.tone === 'danger'
                  ? 'text-rose-600'
                  : item.tone === 'accent'
                    ? 'text-blue-600'
                    : 'text-text-soft';
              return (
                // ds-raw-button: text-left dropdown menuitem row (icon + label)
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    if (item.disabled) return;
                    item.onSelect();
                    setMenuHover(false);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-caption font-bold uppercase tracking-widest disabled:cursor-not-allowed disabled:opacity-40',
                    i > 0 ? 'border-t border-border-hairline' : '',
                    toneClass,
                  )}
                >
                  {item.icon ? (
                    <span className={cn('inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center [&>svg]:h-3.5 [&>svg]:w-3.5', iconClass)}>
                      {item.icon}
                    </span>
                  ) : null}
                  <span className="min-w-0 truncate normal-case tracking-normal font-semibold">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
