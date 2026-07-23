/**
 * SectionTabsSlider right-slot primitives — recessed-track pills that sit
 * beside the labeled TabSwitch strip (`solid` + accent rail chrome).
 *
 * Unbox and Testing both needed an Edit-PO / pairing pencil and a Zendesk
 * external-link pill on the tab bar `rightSlot`. Compose these instead of
 * forking the recessed-track markup per panel.
 */

'use client';

import type { ReactNode } from 'react';
import { ExternalLink, Pencil } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
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
      <button
        type="button"
        aria-label={label}
        aria-expanded={ariaExpanded}
        onClick={onClick}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
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

/** Pairing / Edit-PO pencil toggle — used on Unbox overview + Testing pairing tabs. */
export function PairingTogglePill({
  open,
  onToggle,
  openLabel = 'Hide package pairing',
  closedLabel = 'Show package pairing',
}: {
  open: boolean;
  onToggle: () => void;
  openLabel?: string;
  closedLabel?: string;
}) {
  return (
    <SectionTabsRightTrack>
      <SectionTabsRightPill
        label={open ? openLabel : closedLabel}
        active={open}
        filled={false}
        aria-expanded={open}
        onClick={onToggle}
      >
        <Pencil className="h-4 w-4" />
      </SectionTabsRightPill>
    </SectionTabsRightTrack>
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
