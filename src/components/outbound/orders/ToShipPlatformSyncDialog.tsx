'use client';

/**
 * To-ship **Choose platforms…** — the form behind the Sync CTA. Every linked
 * platform is a checked row (ShipStation, the Google Sheets tracking backup,
 * any other channel); submit runs the SAME desk sync the face runs, narrowed
 * to the checked set, so one ledger reports it.
 */

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, RefreshCw } from '@/components/Icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/design-system/components/Dialog';
import { Button, Checkbox } from '@/design-system/primitives';
import { useOrderSyncSources } from '@/hooks/useOrderSyncSources';

export function ToShipPlatformSyncDialog({
  open,
  onOpenChange,
  onSync,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs the desk sync over exactly these providers. */
  onSync: (providers: string[]) => void;
  busy: boolean;
}) {
  const router = useRouter();
  const sources = useOrderSyncSources();
  const rows = sources.data ?? [];
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());

  // Every open starts from "all linked platforms" — the face's own default.
  // Keyed on the query's data identity, not `rows` (a fresh [] each render).
  useEffect(() => {
    if (open) setChecked(new Set((sources.data ?? []).filter((r) => r.canSync).map((r) => r.provider)));
  }, [open, sources.data]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (checked.size === 0 || busy) return;
    onSync([...checked]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Sync linked platforms</DialogTitle>
          <DialogDescription>
            ShipStation first, then the Google Sheets backup fills blanks and adds the orders ShipStation never saw.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col stack-tight" data-testid="to-ship-platform-sync">
          {sources.isLoading ? <p className="text-role-caption text-text-muted">Loading linked platforms…</p> : null}
          {!sources.isLoading && rows.length === 0 ? (
            <p className="text-role-caption text-text-muted">No linked platform can sync yet.</p>
          ) : null}
          {rows.map((row) => (
            <label
              key={row.provider}
              className="flex cursor-pointer items-center gap-2 rounded-mode-control px-2 py-1.5 text-role-body text-text-default hover:bg-surface-hover has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
              data-testid={`to-ship-platform-sync-${row.provider}`}
            >
              <Checkbox
                checked={checked.has(row.provider)}
                disabled={!row.canSync}
                onCheckedChange={(value) =>
                  setChecked((prev) => {
                    const next = new Set(prev);
                    if (value === true) next.add(row.provider);
                    else next.delete(row.provider);
                    return next;
                  })
                }
              />
              <span className="min-w-0 flex-1 truncate">{row.label.replace(/^Sync /, '')}</span>
              {!row.canSync ? <span className="text-role-micro text-text-muted">Admin only</span> : null}
            </label>
          ))}
          <DialogFooter className="mt-2 flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<ExternalLink aria-hidden className="h-3.5 w-3.5" />}
              onClick={() => router.push('/settings/integrations')}
            >
              Link more
            </Button>
            <span className="flex-1" />
            <Button
              type="submit"
              size="sm"
              icon={<RefreshCw aria-hidden className="h-3.5 w-3.5" />}
              disabled={checked.size === 0 || busy}
              data-testid="to-ship-platform-sync-submit"
            >
              {checked.size === rows.filter((r) => r.canSync).length ? 'Sync all' : `Sync ${checked.size}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
