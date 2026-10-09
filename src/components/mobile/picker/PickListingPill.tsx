'use client';

/**
 * The pick screen's bottom-right pill (owner 2026-09-29; 2026-10-08): a white pill floating over the
 * content, always anchored to the right page edge inside the page gutter. A listing that resolves from
 * the item number opens the marketplace in a new tab, with a pencil beside it to correct a wrongly typed
 * item number; with none, the pill is Pair item number. Both doors open the same item-number sheet.
 */

import { ExternalLink, Link2, Pencil } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { cn } from '@/utils/_cn';

export function PickListingPill({
  listingHref,
  canEdit,
  onEditItemNumber,
}: {
  /** The line's listing on the order's own platform; null → Pair item number. */
  listingHref: string | null;
  /** `orders.create` — the item-number writer's permission. */
  canEdit: boolean;
  onEditItemNumber: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-end px-mode-page">
      {listingHref ? (
        <div
          className={cn(
            'pointer-events-auto flex items-stretch overflow-hidden bg-surface-card',
            cornerClass('pill'),
            elevationClass('raised'),
          )}
        >
          <Button
            href={listingHref}
            variant="secondary"
            size="lg"
            radius="pill"
            iconRight={<ExternalLink />}
            ariaLabel="View listing"
            data-testid="pick-order-listing"
            className="whitespace-nowrap border-0 bg-transparent pl-5 pr-3 font-semibold ring-0"
          >
            Listing
          </Button>
          <span aria-hidden className="my-2.5 w-px shrink-0 bg-mode-rule" />
          <IconButton
            size="touch"
            radius="pill"
            icon={<Pencil className="h-4 w-4" />}
            ariaLabel="Edit item number"
            title="Edit item number"
            onClick={onEditItemNumber}
            disabled={!canEdit}
            data-testid="pick-order-edit-item"
            className="mr-0.5 disabled:opacity-40"
          />
        </div>
      ) : (
        <Button
          variant="secondary"
          size="lg"
          radius="pill"
          icon={<Link2 />}
          onClick={onEditItemNumber}
          disabled={!canEdit}
          data-testid="pick-order-pair-item"
          className={cn(
            'pointer-events-auto whitespace-nowrap border-0 bg-surface-card px-4 font-semibold ring-0',
            elevationClass('raised'),
          )}
        >
          Pair item number
        </Button>
      )}
    </div>
  );
}
