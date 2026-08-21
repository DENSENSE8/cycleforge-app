import type { ReactNode } from 'react';
import type { ChipHoverMenuRow } from '@/components/ui/ChipHoverMenuSurface';
import { normalizeCopyText } from '@/lib/copy-chip-format';
import { recordCopy } from '@/lib/clipboard-history';
import { buildOpenLinksHubHref } from '@/lib/receiving/listing-links';

/**
 * Verbs for the carton bar's LISTING cell, declared once.
 *
 * The bar has two ways to reach the same action set — the cell's own hover menu
 * when it fits on the strip, and a row in the `⋯` overflow when it does not.
 * Those were two hand-written lists: the cell offered Open · Copy · Edit while
 * the overflow offered Open · Edit, so an operator on a narrow bench silently
 * lost Copy and read a different label for the same verb. Responsive spillover
 * must change WHERE a verb lives, never WHICH verbs exist.
 *
 * `qualify` names the cell in the overflow ("Open eBay"), where the row has no
 * neighbouring face to say what it acts on.
 */
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

/**
 * Verbs for the carton bar's LIFECYCLE cell, declared once — same contract as
 * {@link listingMenuRows}: the cell's own hover panel and any `⋯` spillover
 * read from this list, so the two can never offer different sets.
 *
 * **This menu does not move the carton's stage, and that is deliberate.**
 *
 * The stage is DERIVED (`railCoarseStatus` folds local `workflow_status`
 * together with the inventory provider's own state), and a status only changes
 * through `transitionReceivingLine`. A dropdown of stages on this cell would
 * advertise a control the domain does not have.
 *
 * Receive / Unreceive are likewise absent on purpose. They live on the Unbox
 * dock split menu (`unbox-terminal.tsx`), which owns the guard state that makes
 * them safe — `canUnreceive`, the disabled reasons, and the blocking-serial
 * check behind them — and sits beside `ReceiveFeedbackRegion`, the surface that
 * reports whether the provider push actually landed. A second door here would
 * have to re-derive all of it, and would put a destructive rewind behind a
 * hover on a 28px cell.
 *
 * What is left is what a fact cell can honestly offer: say what the stage means
 * right now, and take the operator to the evidence.
 */
export function lifecycleMenuRows({
  label,
  onOpenHistory,
  historyLabel = 'View history',
  onDone,
  icons,
  header,
  qualify = false,
}: {
  /** Coarse stage name — `getReceivingStatusDotLabel`. */
  label: string;
  /** Opens the station's carton-history leaf (Unbox Displays → Timeline). */
  onOpenHistory?: () => void;
  historyLabel?: string;
  /** Runs after any row fires — closes the menu that hosted it. */
  onDone?: () => void;
  /** Row glyphs, supplied by the caller so this module stays icon-free. */
  icons: { history: ReactNode; copy: ReactNode };
  /**
   * Facts block above the verbs — stage + the provider-sync sentence. A node
   * row, because it states rather than acts; rendering it as a disabled
   * menuitem would put it in the keyboard order of a list it is not part of.
   */
  header?: ReactNode;
  /** Name the cell in the overflow, where no neighbouring face says what it acts on. */
  qualify?: boolean;
}): ChipHoverMenuRow[] {
  const done = () => onDone?.();
  return [
    ...(header ? [{ id: 'lifecycle-facts', node: header } satisfies ChipHoverMenuRow] : []),
    ...(onOpenHistory
      ? [
          {
            id: 'lifecycle-history',
            label: qualify ? `${historyLabel} — ${label}` : historyLabel,
            icon: icons.history,
            tone: 'accent' as const,
            ariaLabel: 'Open carton history',
            onSelect: () => {
              onOpenHistory();
              done();
            },
          } satisfies ChipHoverMenuRow,
        ]
      : []),
    {
      id: 'lifecycle-copy',
      label: 'Copy status',
      icon: icons.copy,
      ariaLabel: `Copy status ${label}`,
      onSelect: () => {
        const value = normalizeCopyText(label);
        if (value && value !== '---') {
          void navigator.clipboard.writeText(value);
          recordCopy(value, { kind: 'status', display: label });
        }
        done();
      },
    },
  ];
}
