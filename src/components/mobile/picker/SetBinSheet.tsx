'use client';

/**
 * Set a SKU's home bin from the pick list (owner 2026-09-28): the card's
 * 'No bin' pill opens this; the chosen location becomes `sku_stock.location`
 * through `POST /api/update-sku-location` (`bin.set`) — the desk's own write.
 * The server drops the orders cache, so the card repaints with the bin.
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useLocationPickerOptions } from '@/hooks/useLocationPickerOptions';
import { toShipQueueQuery } from '@/lib/orders/to-ship-queue';
import { refreshDomain } from '@/lib/refresh/bus';

export function SetBinSheet({ sku, onClose }: { sku: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const open = sku != null;
  const { options, loading } = useLocationPickerOptions({ enabled: open });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setError(null);
    onClose();
  };

  const commit = async (location: string) => {
    if (!sku || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/update-sku-location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, location }),
      });
      if (res.status === 403) throw new Error('You can’t set bins — ask a lead.');
      if (!res.ok) throw new Error(`Couldn’t set the bin (${res.status})`);
      await queryClient.invalidateQueries({ queryKey: toShipQueueQuery().queryKey });
      refreshDomain('orders.outbound');
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t set the bin');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <SheetContent side="bottom" aria-describedby={undefined}>
        <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle>{sku ? `Set bin · ${sku}` : 'Set bin'}</SheetTitle>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-3" data-testid="set-bin-sheet">
          <p className="text-role-body text-text-muted">Where does this SKU live? It becomes the SKU&apos;s home bin.</p>
          {/* Inline list, not a popover: a portaled list sits under the sheet's scrim. */}
          <Command className="rounded-mode border border-mode-edge">
            <CommandInput
              placeholder="Bin code, name or room…"
              inputMode="search"
              aria-label={sku ? `Search bins for SKU ${sku}` : 'Search bins'}
              className="h-11 text-base"
              disabled={saving}
            />
            <CommandList className="max-h-[45vh]" data-testid="set-bin-list">
              {loading ? (
                <p role="status" className="px-3 py-3 text-center text-role-caption text-mode-muted">
                  Loading bins…
                </p>
              ) : (
                <CommandEmpty>No matching location</CommandEmpty>
              )}
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.meta ?? ''} ${option.value}`}
                  disabled={saving}
                  onSelect={() => void commit(option.value)}
                  className="min-h-12 border-b border-mode-edge last:border-b-0"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-mono font-semibold text-mode-ink">{option.label}</span>
                    {option.meta ? <span className="truncate text-role-caption text-mode-muted">{option.meta}</span> : null}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          </Command>
          {saving ? (
            <p role="status" className="text-role-caption text-mode-muted">
              Saving…
            </p>
          ) : null}
          {error ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription className="text-role-data opacity-100">{error}</AlertDescription>
            </Alert>
          ) : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
