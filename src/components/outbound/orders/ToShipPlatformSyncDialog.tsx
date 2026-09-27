'use client';

/** To-ship **Sync a platform…** — the sidebar verb `orders-intake:platforms` opens this list of connected order sources. */

import { ExternalLink, RefreshCw } from '@/components/Icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { Button } from '@/design-system/primitives';
import { useToShipPlatformSyncMenu } from '@/components/outbound/orders/useToShipPlatformSyncMenu';

export function ToShipPlatformSyncDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Mounted with the desk, not with the dialog: a provider sync outlives the
  // dialog, and the hook's in-flight guard must survive it closing.
  const rows = useToShipPlatformSyncMenu();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Sync a platform</DialogTitle>
          <DialogDescription>Pull new orders from one connected sales channel.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col stack-tight" data-testid="to-ship-platform-sync">
          {rows.map((row) => (
            <Button
              key={`${row.kind}:${row.label}`}
              type="button"
              variant="secondary"
              className="w-full justify-start"
              icon={
                row.kind === 'more' ? (
                  <ExternalLink aria-hidden className="h-3.5 w-3.5" />
                ) : (
                  <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                )
              }
              disabled={row.disabled}
              onClick={() => {
                row.onClick();
                onOpenChange(false);
              }}
            >
              {row.label}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
