'use client';

/**
 * SoT for a filled order / PO identity chip with hover secondary actions.
 *
 * Parity with {@link TrackingNumberMenuChip} and carton {@link IdentityLinkChip}:
 *   • Chip click = copy (via {@link OrderIdChip})
 *   • Hover → white menu below: **Open** (product / listing / marketplace order
 *     page) · **Edit** (host opens the record inspector)
 *   • Dense uppercase verbs + ExternalLink / Pencil
 *
 * Used by Unbox History / Receiving LedgerGrid ORDER cells. Plain
 * {@link OrderIdChip} remains for read-only / non-menu surfaces.
 */

import { ExternalLink, Pencil } from '@/components/Icons';
import { OrderIdChip, getLast8 } from '@/components/ui/CopyChip';
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
}

export function OrderNumberMenuChip({
  value,
  platformLabel = null,
  openHref = null,
  onEdit,
  onMenuOpenChange,
  plain = false,
  dense = false,
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
      display={getLast8(raw)}
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
