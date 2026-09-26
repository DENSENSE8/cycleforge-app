import type { ReactNode } from 'react';
import type { ChipHoverMenuRow } from '@/components/ui/ChipHoverMenuSurface';
import { normalizeCopyText } from '@/lib/copy-chip-format';
import { recordCopy } from '@/lib/clipboard-history';
import { buildOpenLinksHubHref } from '@/lib/receiving/listing-links';

/** Verbs for the carton bar's LISTING cell, declared once. */
export function listingMenuRows({
  label,
  ariaLabel,
  openHref,
  copyValue,
  links = [],
  onEdit,
  editLabel = 'Edit listing',
  onDone,
  icons,
  qualify = false,
}: {
  label: string;
  ariaLabel: string;
  openHref?: string | null;
  copyValue?: string | null;
  links?: Array<{ href: string; label: string; title?: string | null }>;
  onEdit?: () => void;
  editLabel?: string;
  /** Runs after any row fires — closes the menu that hosted it. */
  onDone?: () => void;
  /** Row glyphs, supplied by the caller so this module stays icon-free. */
  icons: { open: ReactNode; copy: ReactNode; edit: ReactNode };
  qualify?: boolean;
}): ChipHoverMenuRow[] {
  const normalizedValue = normalizeCopyText(copyValue ?? '');
  const canCopy = !!normalizedValue && normalizedValue !== '---';
  const linkOptions = links.filter((l) => l.href);
  const multiLinks = linkOptions.length > 1 ? linkOptions : null;
  const done = () => onDone?.();
  const open = (href: string) => {
    window.open(href, '_blank', 'noopener,noreferrer');
    done();
  };

  return [
    ...(multiLinks
      ? [
          {
            id: 'listing-open-all',
            label: 'Open all',
            icon: icons.open,
            tone: 'accent' as const,
            ariaLabel: `Open all ${label} links`,
            onSelect: () => open(buildOpenLinksHubHref(multiLinks)),
          },
          ...multiLinks.map((opt) => ({
            id: `listing-open-${opt.href}`,
            label: opt.label,
            icon: icons.open,
            tone: 'accent' as const,
            ariaLabel: `Open ${opt.title ?? opt.label}`,
            onSelect: () => open(opt.href),
          })),
        ]
      : []),
    {
      id: 'listing-open',
      label: qualify ? `Open ${label}` : 'Open',
      icon: icons.open,
      tone: 'accent' as const,
      disabled: !openHref,
      ariaLabel: openHref ? ariaLabel : 'No link available',
      onSelect: () => {
        if (openHref) open(openHref);
        else done();
      },
    },
    {
      id: 'listing-copy',
      label: 'Copy',
      icon: icons.copy,
      disabled: !canCopy,
      ariaLabel: `Copy ${label}`,
      onSelect: () => {
        if (canCopy) {
          void navigator.clipboard.writeText(normalizedValue);
          recordCopy(normalizedValue, { kind: 'listing', display: label });
        }
        done();
      },
    },
    ...(onEdit
      ? [
          {
            id: 'listing-edit',
            label: editLabel,
            icon: icons.edit,
            onSelect: () => {
              onEdit();
              done();
            },
          } satisfies ChipHoverMenuRow,
        ]
      : []),
  ];
}
