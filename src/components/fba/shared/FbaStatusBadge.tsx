import type { ReactNode } from 'react';
import { Barcode, Check, ClipboardList, Lock, PackageCheck, Truck } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';

/** Single source of truth for FBA status display. */
type FbaStatus =
  | 'PLANNED'
  | 'TESTED'
  | 'PACKED'
  | 'LABEL_ASSIGNED'
  | 'SHIPPED'
  | 'CLOSED';

interface StatusToken {
  label: string;
  icon: (props: { className?: string }) => ReactNode;
  /** Tailwind classes for the pill (bg + text + border). */
  pill: string;
  /** Tailwind class for the icon color. */
  icon_tone: string;
}

const TOKENS: Record<FbaStatus, StatusToken> = {
  PLANNED: {
    label: 'Planned',
    icon: ClipboardList,
    pill: 'bg-surface-sunken text-text-muted border-border-soft',
    icon_tone: 'text-text-soft',
  },
  TESTED: {
    label: 'Tested',
    icon: Check,
    pill: 'bg-surface-success text-text-success border-border-success',
    icon_tone: 'text-text-success',
  },
  PACKED: {
    label: 'Packed',
    icon: PackageCheck,
    pill: `${LIFECYCLE_CLASSES.packed.pill} ${LIFECYCLE_CLASSES.packed.border}`,
    icon_tone: LIFECYCLE_CLASSES.packed.text,
  },
  LABEL_ASSIGNED: {
    label: 'Combined',
    icon: Barcode,
    pill: 'bg-surface-accent text-text-info border-border-accent',
    icon_tone: 'text-text-info',
  },
  SHIPPED: {
    label: 'Shipped',
    icon: Truck,
    pill: `${LIFECYCLE_CLASSES.shipped.pill} ${LIFECYCLE_CLASSES.shipped.border}`,
    icon_tone: LIFECYCLE_CLASSES.shipped.text,
  },
  CLOSED: {
    label: 'Closed',
    icon: Lock,
    pill: 'bg-surface-sunken text-text-muted border-border-soft',
    icon_tone: 'text-text-soft',
  },
};

const FALLBACK: StatusToken = {
  label: '—',
  icon: ClipboardList,
  pill: 'bg-surface-sunken text-text-soft border-border-soft',
  icon_tone: 'text-text-faint',
};

interface FbaStatusBadgeProps {
  status: FbaStatus | string;
  /** `xs` matches legacy dashboard badge sizing; `sm` suits card headers. */
  size?: 'xs' | 'sm';
  /** When true, only the icon is rendered — useful in dense rows. */
  iconOnly?: boolean;
  className?: string;
}

export function FbaStatusBadge({
  status,
  size = 'xs',
  iconOnly = false,
  className,
}: FbaStatusBadgeProps) {
  const token = (TOKENS as Record<string, StatusToken>)[status] ?? FALLBACK;
  const Icon = token.icon;

  const pad = size === 'sm' ? 'px-2 py-1' : 'px-2 py-0.5';
  const text = size === 'sm' ? 'text-role-micro' : 'text-role-eyebrow';
  const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-2.5 w-2.5';

  if (iconOnly) {
    return (
      <HoverTooltip label={token.label} asChild>
        <span
          aria-label={token.label}
          className={`inline-flex items-center justify-center ${className ?? ''}`}
        >
          <Icon className={`${iconSize} ${token.icon_tone}`} />
        </span>
      </HoverTooltip>
    );
  }

  return (
    <span
      aria-label={token.label}
      className={`inline-flex items-center gap-1 rounded-none border font-semibold ${pad} ${text} ${token.pill} ${className ?? ''}`}
    >
      <Icon className={`${iconSize} ${token.icon_tone}`} />
      {token.label}
    </span>
  );
}
