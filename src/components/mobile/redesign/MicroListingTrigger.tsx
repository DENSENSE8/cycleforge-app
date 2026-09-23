'use client';

/** A governed, SKU-adjacent marketplace inspector — never a row destination. */

import { Link2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export type GovernedListing = Readonly<{
  href: string;
  platform: string;
}>;

export function MicroListingTrigger({ listing }: { listing: GovernedListing }) {
  const platform = listing.platform.trim() || 'Marketplace';
  const label = `${platform} listing`;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          radius="flush"
          iconOnly
          icon={<Link2 />}
          ariaLabel={label}
          data-testid="item-card-listing"
          className="relative h-6 w-6 shrink-0 p-0 text-text-muted before:absolute before:-inset-2.5"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent
        data-testid="micro-listing-overlay"
        aria-describedby={undefined}
        className="h-[min(72svh,34rem)] max-w-[calc(100vw-1rem)] gap-0 p-0"
      >
        <DialogHeader className="border-b border-border-hairline px-3 py-2 pr-10">
          <DialogTitle className="font-mono text-role-caption font-semibold uppercase tracking-wide">
            {platform} listing
          </DialogTitle>
          <DialogDescription>
            Marketplace verification — closing this view preserves the active order row.
          </DialogDescription>
        </DialogHeader>
        <iframe
          data-testid="micro-listing-frame"
          title={`${platform} listing`}
          src={listing.href}
          className="min-h-0 w-full flex-1 border-0 bg-surface-canvas"
          referrerPolicy="no-referrer"
          sandbox="allow-forms allow-popups allow-scripts allow-same-origin"
        />
      </DialogContent>
    </Dialog>
  );
}
