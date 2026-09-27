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
import { ExternalLink, Link2, Pencil } from '@/components/Icons';
import { Popover, PopoverContent, PopoverTrigger } from '@/design-system/primitives/radix-popover';
import { Button } from '@/design-system/primitives/Button';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { commitExceptionsItemPaste } from '@/lib/orders/exceptions-cta';
import { refreshDomain } from '@/lib/refresh/bus';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

const ICON_CLASS = cn(
  'ds-raw-button inline-flex size-6 shrink-0 items-center justify-center rounded-mode-control text-mode-muted hover:bg-mode-hover hover:text-mode-ink',
  focusRing('control'),
);

/** A one-field popover: type or paste, Enter saves; Remove when something is stored. */
function LinkFieldPopover({
  trigger,
  label,
  placeholder,
  initial,
  submitLabel,
  onSubmit,
  onRemove,
  testId,
}: {
  trigger: ReactNode;
  label: string;
  placeholder: string;
  initial: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<boolean>;
  onRemove?: () => Promise<boolean>;
  testId: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await action();
    setBusy(false);
    if (ok) setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(initial);
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
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
 * The icon right of the order number: ↗ opens the admin page and a pencil
 * edits it; with no link at all, a link icon adds one.
 */
export function OrderAdminLinkAction({
  orderId,
  href,
  storedUrl,
  ids,
  platformLabel,
}: {
  orderId: string;
  /** Effective link — {@link storedUrl} or the derived marketplace URL. */
  href: string | null;
  storedUrl: string | null;
  /** Every line of the order — the link is written on each. */
  ids: readonly number[];
  platformLabel?: string | null;
}) {
  const editor = (trigger: ReactNode) => (
    <LinkFieldPopover
      trigger={trigger}
      label="Admin page link"
      placeholder="https://…"
      initial={storedUrl ?? ''}
      submitLabel="Save link"
      onSubmit={(value) => patchAdminUrl(ids, value)}
      onRemove={storedUrl ? () => patchAdminUrl(ids, null) : undefined}
      testId="order-admin-link"
    />
  );
  if (!href) {
    return editor(
      <button
        type="button"
        onClick={stop}
        onPointerDown={stop}
        aria-label={`Add a link to order ${orderId}`}
        title="Add admin page link"
        data-testid="order-admin-link-add"
        className={ICON_CLASS}
      >
        <Link2 className="size-3.5" />
      </button>,
    );
  }
  return (
    <span className="group/order-link inline-flex shrink-0 items-center">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={stop}
        onPointerDown={stop}
        data-testid="order-card-open-order"
        aria-label={`Open order ${orderId} on ${platformLabel || 'the platform'}`}
        title={storedUrl ? 'Open admin page (saved link)' : `Open on ${platformLabel || 'the platform'}`}
        className={ICON_CLASS}
      >
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
      {editor(
        <button
          type="button"
          onClick={stop}
          onPointerDown={stop}
          aria-label={`Edit the link to order ${orderId}`}
          title="Edit admin page link"
          data-testid="order-admin-link-edit"
          className={cn(ICON_CLASS, 'opacity-0 group-hover/order-link:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100')}
        >
          <Pencil className="size-3" />
        </button>,
      )}
    </span>
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
          'ds-raw-button inline-flex shrink-0 items-center gap-1 rounded-mode-control px-1 text-[13px] text-mode-muted hover:bg-mode-hover hover:text-mode-ink',
          focusRing('control'),
        )}
      >
        Listing
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
