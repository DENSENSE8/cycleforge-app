/**
 * SectionTabsSlider right-slot primitives — controls beside the display strip.
 *
 * Unbox Displays (`density="icon"`) and Testing both need an Edit-PO / pairing
 * pencil and a Zendesk external-link on the tab bar `rightSlot`. The icon-rail
 * contract is a **flat icon** (no circular track / shadow plate) so the pencil
 * sits in the same quiet row as the vertical ⋮ overflow. Scan-progress ring
 * stays pane-anchored — not in this slot.
 *
 * {@link SectionTabsRightTrack} remains for call sites that still want a
 * recessed pill cluster (e.g. Testing external-link when not on an icon rail).
 */

'use client';

import type { ReactNode } from 'react';
import { ExternalLink, Pencil } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { operatorAccentClasses } from '@/utils/operator-accent';
import { cn } from '@/utils/_cn';

/** Light rail that matches TabSwitch `variant="solid"` chrome. */
export function SectionTabsRightTrack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border border-border-default bg-surface-card p-1 shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Icon pill inside {@link SectionTabsRightTrack}. */
export function SectionTabsRightPill({
  label,
  active = false,
  filled = true,
  onClick,
  children,
  'aria-expanded': ariaExpanded,
}: {
  label: string;
  active?: boolean;
  /** When false, inactive state is text-only (pairing pencil parity). */
  filled?: boolean;
  onClick: () => void;
  children: ReactNode;
  'aria-expanded'?: boolean;
}) {
  return (
    <HoverTooltip label={label} placement="below" focusable={false} asChild>
      {/* ds-raw-button: HoverTooltip asChild Slot — IconButton would disturb the clone */}
      <button
        type="button"
        aria-label={label}
        aria-expanded={ariaExpanded}
        onClick={onClick}
        className={cn(
          'ds-raw-button flex h-8 w-8 items-center justify-center rounded-full transition-colors',
          active
            ? `${operatorAccentClasses.activePill} text-white`
            : filled
              ? 'text-text-muted hover:bg-surface-hover hover:text-text-default'
              : 'text-text-muted hover:text-text-default',
        )}
      >
        {children}
      </button>
    </HoverTooltip>
  );
}

/**
 * Pairing / Edit-PO pencil — flat icon for the Displays icon-rail row
 * (no circular plate). Active state tints accent; idle stays soft ink.
 */
export function PairingTogglePill({
  open,
  onToggle,
  openLabel = 'Hide package pairing',
  closedLabel = 'Show package pairing',
  size = 'sm',
}: {
  open: boolean;
  onToggle: () => void;
  openLabel?: string;
  closedLabel?: string;
  size?: 'xs' | 'sm';
}) {
  const label = open ? openLabel : closedLabel;
  return (
    <HoverTooltip label={label} placement="below" focusable={false} asChild>
      <IconButton
        size={size}
        tone={open ? 'accent' : 'neutral'}
        ariaLabel={label}
        aria-expanded={open}
        onClick={onToggle}
        icon={<Pencil className={size === 'xs' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />}
        data-testid="section-tabs-pairing-pencil"
      />
    </HoverTooltip>
  );
}

/** External-link pill — Zendesk / provider ticket deep link on support tabs. */
export function ExternalLinkPill({
  href,
  label = 'Open ticket',
}: {
  href: string;
  label?: string;
}) {
  return (
    <SectionTabsRightTrack>
      <SectionTabsRightPill
        label={label}
        onClick={() => window.open(href, '_blank', 'noopener,noreferrer')}
      >
        <ExternalLink className="h-4 w-4" />
      </SectionTabsRightPill>
    </SectionTabsRightTrack>
  );
}
