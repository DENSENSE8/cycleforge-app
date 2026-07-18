'use client';

/**
 * Labels-mode scan band — {@link ThemedStationScanBar} in a flush
 * {@link ScanBandShell}, same geometry as Unbox / Shipping / Scan-out.
 * Submit resolves order # / tracking / SKU against the labels queue (then any
 * order) and opens the focused label workspace via `?open=`.
 */

import { useCallback, useRef, useState, type FormEvent } from 'react';
import { ThemedStationScanBar } from '@/components/station/scan-bar';
import { ScanBandShell } from '@/components/sidebar/receiving/ReceivingScanBands';
import { Barcode } from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { useStationTheme } from '@/hooks/useStationTheme';
import { useOutboundUrlState } from '@/hooks/useOutboundUrlState';
import {
  fetchAwaitingLabelsData,
  fetchOutboundOrderRowById,
} from '@/lib/outbound/outbound-table-data';
import { toast } from '@/lib/toast';

async function resolveLabelsScan(raw: string): Promise<number | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Numeric primary key (workspace `?open=` uses orders.id).
  if (/^\d{1,9}$/.test(trimmed)) {
    const byId = await fetchOutboundOrderRowById(Number(trimmed));
    if (byId) return Number(byId.id);
  }

  // Prefer awaiting-label hits (this station's queue).
  const awaiting = await fetchAwaitingLabelsData({ searchQuery: trimmed });
  if (awaiting[0]) return Number(awaiting[0].id);

  // Broader lookup — already-labeled / staged orders still open the workspace.
  const params = new URLSearchParams();
  params.set('q', trimmed);
  params.set('includeShipped', 'true');
  params.set('limit', '5');
  const res = await fetch(`/api/orders?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = (await res.json()) as { orders?: Array<{ id?: number }> };
  const id = Number(data.orders?.[0]?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function LabelsScanBand({ autoFocus = true }: { autoFocus?: boolean } = {}) {
  const { user } = useAuth();
  const { theme: themeColor } = useStationTheme({ staffId: user?.staffId ?? 0 });
  const { setOpen } = useOutboundUrlState();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [resolving, setResolving] = useState(false);

  const refocus = useCallback(() => {
    queueMicrotask(() => inputRef.current?.focus());
  }, []);

  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();
      const trimmed = value.trim();
      if (!trimmed || resolving) return;
      setResolving(true);
      try {
        const id = await resolveLabelsScan(trimmed);
        if (id == null) {
          toast.error(`No order found for “${trimmed}”`);
          refocus();
          return;
        }
        setOpen(id);
        setValue('');
        refocus();
      } catch {
        toast.error('Lookup failed — try again');
        refocus();
      } finally {
        setResolving(false);
      }
    },
    [value, resolving, setOpen, refocus],
  );

  return (
    <ScanBandShell themeColor={themeColor}>
      <ThemedStationScanBar
        value={value}
        onChange={setValue}
        onSubmit={submit}
        inputRef={inputRef}
        staffId={user?.staffId}
        autoFocus={autoFocus}
        placeholder="Scan order # · tracking · SKU"
        icon={<Barcode className="h-[17px] w-[17px]" />}
        iconClassName="text-text-faint"
        isResolving={resolving}
        onPaste={(text) => setValue(text)}
        className="w-full"
      />
    </ScanBandShell>
  );
}
