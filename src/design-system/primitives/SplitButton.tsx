'use client';

/**
 * Split button — one boxed control with two hit areas.
 *
 * ```text
 *   [ + Add ]|[ v ]
 *            ├ Import from file
 *            └ Import latest orders
 * ```
 *
 * Primary (left) fires the common command. Chevron (right) opens a flat,
 * flush-square menu of sibling commands. Two tab stops: Tab → primary,
 * Tab → chevron, Enter opens, arrows select. SoT for WMS ingest CTAs
 * (Add + Import) — compose this instead of two isolated pills.
 */

import type { ReactNode } from 'react';
import { ChevronDown } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { Button, type ButtonSize, type ButtonVariant } from './Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './DropdownMenu';

export interface SplitButtonItem {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}

export const SPLIT_BUTTON_GROUP_CLASS = 'inline-flex items-stretch';

/** 1px vertical rule between the primary and the chevron — the only vertical line in this control. */
export const SPLIT_BUTTON_DIVIDER_CLASS: Record<'primary' | 'brand' | 'danger' | 'secondary' | 'ghost', string> = {
  primary: 'w-px shrink-0 self-stretch bg-white/30',
  brand: 'w-px shrink-0 self-stretch bg-white/30',
  danger: 'w-px shrink-0 self-stretch bg-white/30',
  secondary: 'w-px shrink-0 self-stretch bg-border-soft',
  ghost: 'w-px shrink-0 self-stretch bg-border-soft',
};

/** Flush rectangle, zero pad, sitting on the button's bottom edge. */
export const SPLIT_MENU_CONTENT_CLASS =
  'rounded-none border border-border-soft bg-surface-card p-0 shadow-none';

/** Tight rows; 1px horizontal rule between options (no extra whitespace). */
export const SPLIT_MENU_ITEM_CLASS =
  'rounded-none px-3 py-1.5 text-role-caption font-medium normal-case tracking-normal';

export function SplitButton({
  label,
  icon,
  onClick,
  ariaLabel,
  menuAriaLabel,
  groupAriaLabel,
  items,
  variant = 'primary',
  size = 'sm',
  disabled = false,
  loading = false,
  menuIcon,
  className,
  'data-testid': testId,
  menuTestId,
}: {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  ariaLabel?: string;
  /** Accessible name for the chevron trigger (e.g. "Import orders"). */
  menuAriaLabel: string;
  /** Accessible name for the boxed group (two hit areas). */
  groupAriaLabel?: string;
  items: readonly SplitButtonItem[];
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Override the chevron (e.g. a spinner while an import command runs). */
  menuIcon?: ReactNode;
  className?: string;
  'data-testid'?: string;
  menuTestId?: string;
}) {
  if (items.length === 0) {
    return (
      <Button
        size={size}
        variant={variant}
        icon={icon}
        ariaLabel={ariaLabel}
        onClick={onClick}
        disabled={disabled}
        loading={loading}
        className={className}
        data-testid={testId}
      >
        {label}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <div role="group" aria-label={groupAriaLabel ?? `${label} actions`} className={cn(SPLIT_BUTTON_GROUP_CLASS, className)}>
        <Button
          size={size}
          variant={variant}
          icon={icon}
          ariaLabel={ariaLabel}
          onClick={onClick}
          disabled={disabled}
          loading={loading}
          className="shadow-none"
          data-testid={testId}
        >
          {label}
        </Button>
        <span aria-hidden className={SPLIT_BUTTON_DIVIDER_CLASS[variant]} />
        <DropdownMenuTrigger asChild>
          <Button
            size={size}
            variant={variant}
            icon={menuIcon ?? <ChevronDown className="h-3.5 w-3.5" />}
            ariaLabel={menuAriaLabel}
            disabled={disabled}
            className="w-8 px-0 shadow-none"
            data-testid={menuTestId}
          />
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={0}
        collisionPadding={0}
        className={cn(SPLIT_MENU_CONTENT_CLASS, 'min-w-[12rem]')}
      >
        {items.map((item, index) => (
          <DropdownMenuItem
            key={item.key}
            disabled={item.disabled}
            onSelect={() => item.onSelect()}
            className={cn(
              SPLIT_MENU_ITEM_CLASS,
              index > 0 && 'border-t border-border-hairline',
            )}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
