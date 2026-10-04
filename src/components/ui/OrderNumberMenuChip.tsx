'use client';

/** SoT for a filled order / PO identity chip with hover secondary actions. */

import { ExternalLink, Pencil } from '@/components/Icons';
import { OrderIdChip } from '@/components/ui/CopyChip';
import { CopyChipHoverMenu, type CopyChipHoverMenuItem } from '@/components/ui/CopyChipHoverMenu';

interface OrderNumberMenuChipProps {
  value: string;
  /** Catalog-resolved platform name for the full-value hover label. */
  platformLabel?: string | null;
  /**
   * Product / listing / marketplace order URL for Open. Null → Open stays
   * disabled (Edit still shows when {@link onEdit} is set).
   */
  openHref?: string | null;
  /** Opens the host's edit / pairing / inspector flow. Omit to hide Edit. */
  onEdit?: () => void;
  onMenuOpenChange?: (open: boolean) => void;
  /** Quiet icon-less face for Sheets grids whose header already labels ORDER. */
  plain?: boolean;
  /** Caption-mono face for LedgerGrid Sheets body. */
  dense?: boolean;
  /**
   * `last8` (default) — the stationary last-eight footprint. `full` — the whole
   * order number, sized to its text (desk To-ship rows, operator 2026-09-26).
   */
  face?: 'last8' | 'full';
}

export function OrderNumberMenuChip({
  value,
  platformLabel = null,
  openHref = null,
  onEdit,
  onMenuOpenChange,
  plain = false,
  dense = false,
  face = 'last8',
}: OrderNumberMenuChipProps) {
  const raw = String(value || '').trim();
  const href = String(openHref || '').trim() || null;

  const items: CopyChipHoverMenuItem[] = [];

  items.push({
    id: 'open-order',
    label: 'Open',
    icon: <ExternalLink />,
    tone: 'accent',
    disabled: !href,
    onSelect: () => {
      if (!href) return;
      window.open(href, '_blank', 'noopener,noreferrer');
    },
  });

  if (onEdit) {
    items.push({
      id: 'edit-order',
      label: 'Edit',
      icon: <Pencil />,
      onSelect: () => onEdit(),
    });
  }

  const chip = (
    <OrderIdChip
      value={raw}
      displayMode={face === 'full' ? 'full' : 'compact'}
      platformLabel={platformLabel}
      plain={plain}
      dense={dense}
      truncateDisplay={false}
      fitDisplayWidth
    />
  );

  // No Edit and no usable Open → plain chip (copy + dark full-value tooltip).
  if (!onEdit && !href) {
    return chip;
  }

  return (
    <CopyChipHoverMenu
      menuLabel="Order number actions"
      items={items}
      denseLabel
      onOpenChange={onMenuOpenChange}
    >
      {chip}
    </CopyChipHoverMenu>
  );
}
