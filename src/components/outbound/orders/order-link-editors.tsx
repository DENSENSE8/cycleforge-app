'use client';

/**
 * The order number's and the listing's link, always present (owner
 * 2026-09-27): a stored or derived link opens in a new tab and stays editable;
 * no link shows "Add link" so a manual order can still reach its admin page.
 *
 * - Order: `orders.admin_url` (PATCH /api/orders/[id] `adminUrl`) on every line
 *   of the order; cleared → the derived marketplace URL returns.
 * - Listing: an item number or listing URL, committed through the same paste
 *   path as the Exceptions verb (`commitExceptionsItemPaste`) — the listing link
 *   is derived from `orders.item_number`.
 */

import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Link2, Pencil } from '@/components/Icons';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/design-system/primitives/radix-popover';
import { CopyChipHoverMenu } from '@/components/ui/CopyChipHoverMenu';
import { Button } from '@/design-system/primitives/Button';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { CARD_DISCLOSE } from '@/design-system/tokens/desk-stage';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { commitExceptionsItemPaste } from '@/lib/orders/exceptions-cta';
import { bustFulfillmentCaches } from '@/lib/outbound/outbound-cache-keys';
import { refreshDomain } from '@/lib/refresh/bus';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { copyToClipboard } from '@/utils/_dom';

const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

const ICON_CLASS = cn(
  'ds-raw-button inline-flex size-6 shrink-0 items-center justify-center rounded-mode-control text-mode-muted hover:bg-mode-hover hover:text-mode-ink',
  focusRing('control'),
);

/**
 * A one-field popover: type or paste, Enter saves; Remove when something is stored.
 * `trigger` toggles it; `anchor` only positions it (the host opens it via `open`).
 */
function LinkFieldPopover({
  trigger,
  anchor,
  open: openProp,
  onOpenChange,
  label,
  placeholder,
  initial,
  submitLabel,
  onSubmit,
  onRemove,
  testId,
}: {
  trigger?: ReactNode;
  anchor?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label: string;
  placeholder: string;
  initial: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<boolean>;
  onRemove?: () => Promise<boolean>;
  testId: string;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  // A host-opened popover (anchor mode) seeds its draft when it opens.
  const [seededFor, setSeededFor] = useState(false);
  if (open !== seededFor) {
    setSeededFor(open);
    if (open) setDraft(initial);
  }
  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await action();
    setBusy(false);
    if (!ok) return;
    // The To-ship list reads `['dashboard-table', 'unshipped']`; the domain
    // signal alone does not refetch it (realtime does, when connected).
    bustFulfillmentCaches(queryClient);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {anchor ? <PopoverAnchor asChild>{anchor}</PopoverAnchor> : <PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-80 rounded-mode p-2"
        onClick={stop}
        onPointerDown={stop}
        data-testid={`${testId}-popover`}
      >
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const next = draft.trim();
            if (!next || busy) return;
            void run(() => onSubmit(next));
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="mode-label text-mode-muted">{label}</span>
            <input
              autoFocus
              value={draft}
              placeholder={placeholder}
              onChange={(event) => setDraft(event.target.value)}
              data-testid={`${testId}-input`}
              className={cn(
                'w-full rounded-mode-control border border-mode-control bg-mode-panel px-2 py-1.5 text-sm text-mode-ink',
                focusRing('control'),
              )}
            />
          </label>
          <span className="flex items-center justify-end gap-1.5">
            {onRemove ? (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void run(onRemove)}>
                Remove
              </Button>
            ) : null}
            <Button type="submit" size="sm" disabled={busy || !draft.trim()} data-testid={`${testId}-save`}>
              {submitLabel}
            </Button>
          </span>
        </form>
      </PopoverContent>
    </Popover>
  );
}

async function patchAdminUrl(ids: readonly number[], adminUrl: string | null): Promise<boolean> {
  try {
    await Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`/api/orders/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminUrl }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string; details?: unknown };
          throw new Error(typeof data.error === 'string' ? data.error : `Save failed (${res.status})`);
        }
      }),
    );
    refreshDomain('orders.outbound');
    toast.success(adminUrl ? 'Order link saved' : 'Order link removed');
    return true;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Could not save the order link');
    return false;
  }
}

/**
 * The order number with its admin link. `children` is the order-number face:
 * hovering IT flies out a menu ("Edit admin link" / "Add admin link") that opens
 * the link popover under the number — nothing is reserved beside the number.
 * The ↗ after it only opens. With no link at all, a link icon adds one.
 */
export function OrderAdminLinkAction({
  children,
  fill = false,
  orderId,
  href,
  storedUrl,
  ids,
  platformLabel,
  revealOpenOnHover = false,
  showInlineOpen = true,
}: {
  /** The order-number face (chip / full id). */
  children: ReactNode;
  /** The face takes the row's free width (record fact rows); default hugs its text (cards). */
  fill?: boolean;
  orderId: string;
  /** Effective link — {@link storedUrl} or the derived marketplace URL. */
  href: string | null;
  storedUrl: string | null;
  /** Every line of the order — the link is written on each. */
  ids: readonly number[];
  platformLabel?: string | null;
  /** Detail headers reveal the external/admin-link affordance only on hover or keyboard focus. */
  revealOpenOnHover?: boolean;
  /** Dense list rows keep Open in the hover menu instead of painting a fixed icon. */
  showInlineOpen?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const editLabel = storedUrl || href ? 'Edit order ID link' : 'Add order ID link';
  const revealClass = revealOpenOnHover
    ? 'pointer-events-none absolute left-full top-1/2 ml-0 -translate-y-1/2 opacity-0 transition-opacity group-hover/order-title:pointer-events-auto group-hover/order-title:opacity-100 group-focus-within/order-title:pointer-events-auto group-focus-within/order-title:opacity-100'
    : undefined;
  const face = (
    <span className={cn('flex min-w-0 items-center', fill && 'flex-1')} data-testid="order-admin-link-face">
      <CopyChipHoverMenu
        menuLabel="Order number actions"
        denseLabel
        placement={revealOpenOnHover ? 'top' : 'auto'}
        align={revealOpenOnHover ? 'center' : 'start'}
        className={cn('min-w-0 shrink', fill && 'flex-1')}
        items={[
          {
            id: 'copy-order-id',
            // The hover surface over a compact face: it names the complete id, never the face.
            label: `Copy ${orderId}`,
            icon: <Copy />,
            onSelect: () => {
              void copyToClipboard(orderId, { historyKind: 'id', historyDisplay: orderId }).then((ok) =>
                ok ? toast.success(`Copied ${orderId}`) : toast.error('Could not copy the order ID'),
              );
            },
          },
          ...(href
            ? [
                {
                  id: 'open-order-link',
                  label: `Open on ${platformLabel || 'platform'}`,
                  icon: <ExternalLink />,
                  onSelect: () => window.open(href, '_blank', 'noopener,noreferrer'),
                },
                {
                  id: 'copy-order-link',
                  label: 'Copy order link',
                  icon: <Link2 />,
                  onSelect: () => {
                    void copyToClipboard(href, { historyKind: 'id', historyDisplay: orderId }).then((ok) =>
                      ok ? toast.success('Order link copied') : toast.error('Could not copy the order link'),
                    );
                  },
                },
              ]
            : []),
          { id: 'edit-admin-link', label: editLabel, icon: <Pencil />, onSelect: () => setEditing(true) },
        ]}
      >
        {children}
      </CopyChipHoverMenu>
    </span>
  );
  return (
    <>
      <LinkFieldPopover
        anchor={face}
        open={editing}
        onOpenChange={setEditing}
        label="Admin page link"
        placeholder="https://…"
        initial={storedUrl ?? ''}
        submitLabel="Save link"
        onSubmit={(value) => patchAdminUrl(ids, value)}
        onRemove={storedUrl ? () => patchAdminUrl(ids, null) : undefined}
        testId="order-admin-link"
      />
      {href && showInlineOpen ? (
        <HoverTooltip label={storedUrl ? 'Open admin page (saved link)' : `Open on ${platformLabel || 'the platform'}`} asChild>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={stop}
            onPointerDown={stop}
            data-testid="order-card-open-order"
            aria-label={`Open order ${orderId} on ${platformLabel || 'the platform'}`}
            className={cn(ICON_CLASS, revealClass)}
          >
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </HoverTooltip>
      ) : !href ? (
        <HoverTooltip label="Add admin page link" asChild>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setEditing(true);
            }}
            onPointerDown={stop}
            aria-label={`Add a link to order ${orderId}`}
            data-testid="order-admin-link-add"
            className={cn(ICON_CLASS, revealClass)}
          >
            <Link2 className="size-3.5" />
          </button>
        </HoverTooltip>
      ) : null}
    </>
  );
}

export interface ListingPasteTarget {
  id: number;
  itemNumber: string | null;
  accountSource: string | null;
}

async function commitListing(raw: string, targets: readonly ListingPasteTarget[]): Promise<boolean> {
  const result = await commitExceptionsItemPaste(raw, targets);
  if (!result.ok) {
    toast.error(result.error);
    return false;
  }
  if (result.outcome === 'ambiguous') {
    toast.error('Several catalog matches — pick one in Resolve.');
    return false;
  }
  refreshDomain('orders.outbound');
  toast.success(result.outcome === 'matched' ? `Listing linked — ${result.sku}` : 'Listing item number saved');
  return true;
}

/**
 * The listing's "add / edit" control: paste an item number or listing URL.
 * `face="label"` is the card's "Listing 🔗" empty state; `face="icon"` is the
 * record's trailing pencil / link icon.
 */
export function ListingLinkEditor({
  targets,
  currentItem,
  face,
}: {
  targets: readonly ListingPasteTarget[];
  currentItem: string | null;
  face: 'label' | 'icon';
}) {
  const trigger =
    face === 'label' ? (
      <button
        type="button"
        onClick={stop}
        onPointerDown={stop}
        aria-label="Add a listing link"
        title="Add listing — item number or URL"
        data-testid="order-listing-link-add"
        className={cn(
          'ds-raw-button inline-flex h-6 shrink-0 items-center gap-1 rounded-mode-control px-1 text-[13px] text-mode-muted hover:bg-mode-hover hover:text-mode-ink',
          focusRing('control'),
        )}
      >
        {/* The card's container (`@container/card`) drops the word under the `label` tier; the aria-label carries it. */}
        <span className={CARD_DISCLOSE.label.show}>Listing</span>
        <Link2 aria-hidden className="size-3.5" />
      </button>
    ) : (
      <button
        type="button"
        onClick={stop}
        onPointerDown={stop}
        aria-label={currentItem ? 'Change the listing' : 'Add a listing link'}
        title={currentItem ? 'Change listing — item number or URL' : 'Add listing — item number or URL'}
        data-testid="order-listing-link-edit"
        className={ICON_CLASS}
      >
        {currentItem ? <Pencil className="size-3" /> : <Link2 className="size-3.5" />}
      </button>
    );
  return (
    <LinkFieldPopover
      trigger={trigger}
      label="Listing"
      placeholder="Item number or listing URL…"
      initial={currentItem ?? ''}
      submitLabel="Save listing"
      onSubmit={(value) => commitListing(value, targets)}
      testId="order-listing-link"
    />
  );
}
