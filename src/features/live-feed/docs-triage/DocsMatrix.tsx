'use client';

/**
 * The docs popover's zoomed-out face (operator 2026-10-06: rail and matrix,
 * toggle): every selected order × Shipping label · Packing slip · Product
 * paperwork, one state cell each. A cell opens that order on that tab (the
 * rail). Ticking orders lets ONE library document be linked to all of their
 * owed paperwork lines at once — each line paired at its default scope (SKU
 * first) through the same writer as the pane (`pairOrderManual`).
 */

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { useMotionTransition } from '@/design-system/foundations/motion-presets-hooks';
import { springSnappy } from '@/design-system/motion/tokens';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { DocumentPreviewFrame } from '@/design-system/components/DocumentPreviewFrame';
import { SearchableSelectField } from '@/design-system/components/SearchableSelectField';
import { LifecycleCode } from '@/design-system/components/record-ledger/LifecycleCode';
import { Checkbox } from '@/design-system/primitives';
import { isPacketGap, type OrderPacket } from '@/lib/label-prints/order-packet-contracts';
import { defaultPairScope } from '@/lib/manuals/paperwork-pairing';
import { pairOrderManual } from '@/lib/orders/order-paperwork-client';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { SLOT_STATE_FACE } from '@/features/labels-docs/orders/pane/slot-faces';
import { usePacketRefresh } from '@/features/labels-docs/orders/pane/use-packet-refresh';
import { linkedItems } from './doc-selection';
import { DOC_TAB_LABEL, DOC_TABS, docTabState, type DocTab } from './doc-tabs';

/** Peek dwell — a cell crossed on the way elsewhere does not fetch a PDF. */
const PEEK_DELAY_MS = 350;

/** A grid cell's hover peek: the tab's first document on file, small, or what is owed. */
function CellPeek({ packet, tab }: { packet: OrderPacket; tab: DocTab }) {
  const items = linkedItems(packet, tab);
  const first = items[0];
  if (!first) {
    return (
      <span className="block max-w-56 rounded-lg border border-border-soft bg-surface-card px-3 py-2 text-role-caption text-text-muted shadow-sm">
        {docTabState(packet, tab) === 'not_required' ? `${DOC_TAB_LABEL[tab]} not required` : `No ${DOC_TAB_LABEL[tab].toLowerCase()} yet — click to link one`}
      </span>
    );
  }
  return (
    <span className="flex h-80 w-60 flex-col overflow-hidden rounded-lg border border-border-soft bg-surface-card shadow-sm" data-testid="docs-matrix-peek">
      <DocumentPreviewFrame title={first.title} src={first.src} emptyTitle="Stored on Drive only — no preview" pdfFit="page" className="min-h-0" />
      <span className="truncate border-t border-border-hairline px-2 py-1 text-role-caption text-text-muted" title={first.title}>
        {first.title}
        {items.length > 1 ? ` +${items.length - 1}` : ''}
      </span>
    </span>
  );
}

interface LibraryManual {
  id: number;
  display_name: string | null;
  product_title: string | null;
  item_number: string | null;
  type: string | null;
}

export function DocsMatrix({ packets, onOpen }: { packets: readonly OrderPacket[]; onOpen: (orderId: number, tab: DocTab) => void }) {
  const refresh = usePacketRefresh();
  const layout = useMotionTransition(springSnappy);
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const owing = packets.filter((packet) => isPacketGap(docTabState(packet, 'paperwork')));
  const chosen = packets.filter((packet) => picked.has(packet.orderId));
  const allPicked = owing.length > 0 && owing.every((packet) => picked.has(packet.orderId));

  const toggle = (orderId: number) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });

  const link = useMutation({
    mutationFn: async (manualId: number) => {
      let lines = 0;
      for (const packet of chosen) {
        for (const line of packet.lines) {
          if (!isPacketGap(line.state)) continue;
          await pairOrderManual(line.orderLineId, manualId, defaultPairScope(line));
          lines += 1;
        }
      }
      return lines;
    },
    onSuccess: (lines) => {
      toast.success(`Linked to ${lines} line${lines === 1 ? '' : 's'} across ${chosen.length} order${chosen.length === 1 ? '' : 's'}`);
      setPicked(new Set());
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => void refresh(),
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="docs-matrix">
      {chosen.length > 0 ? (
        <div className="flex min-w-0 items-center gap-3 border-b border-border-soft bg-surface-sunken px-4 py-2">
          <span className="shrink-0 text-role-caption font-semibold text-text-default">
            {chosen.length} order{chosen.length === 1 ? '' : 's'} — link one document to their paperwork
          </span>
          <div className="min-w-0 flex-1">
            <LibraryPicker pending={link.isPending} onPick={(manualId) => link.mutate(manualId)} />
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-surface-card">
            <tr className="border-b border-border-soft text-role-eyebrow uppercase tracking-wide text-text-faint">
              <th className="w-10 px-3 py-2">
                <Checkbox
                  aria-label="Select every order owed paperwork"
                  checked={allPicked}
                  disabled={owing.length === 0}
                  onCheckedChange={(next) => setPicked(next === true ? new Set(owing.map((packet) => packet.orderId)) : new Set())}
                />
              </th>
              <th className="px-3 py-2 font-semibold">Order</th>
              {DOC_TABS.map((tab) => (
                <th key={tab} className="px-3 py-2 font-semibold">
                  {DOC_TAB_LABEL[tab]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {packets.map((packet) => (
              <motion.tr
                key={packet.orderId}
                layout="position"
                transition={layout}
                className={cn('border-b border-border-hairline', picked.has(packet.orderId) && 'bg-surface-selected')}
              >
                <td className="px-3 py-1.5">
                  <Checkbox aria-label={`Select ${packet.orderRef}`} checked={picked.has(packet.orderId)} onCheckedChange={() => toggle(packet.orderId)} />
                </td>
                <td className="px-3 py-1.5">
                  <span className="break-all font-mono text-role-data font-medium text-text-default">{packet.orderRef}</span>
                  <span className="block truncate text-role-caption text-text-muted" title={packet.lines.map((line) => line.title).join(' · ')}>
                    {packet.lines[0]?.title ?? ''}
                    {packet.lines.length > 1 ? ` +${packet.lines.length - 1}` : ''}
                  </span>
                </td>
                {DOC_TABS.map((tab) => {
                  const state = docTabState(packet, tab);
                  return (
                    <td key={tab} className="px-3 py-1.5">
                      <HoverTooltip label={<CellPeek packet={packet} tab={tab} />} chrome="plain" openDelayMs={PEEK_DELAY_MS} placement="auto" asChild>
                        {/* ds-raw-button: the state code IS the cell's face (LifecycleCode); a Button face would double its frame. */}
                        <button
                          type="button"
                          onClick={() => onOpen(packet.orderId, tab)}
                          className="ds-raw-button rounded-md p-0.5 hover:bg-surface-hover"
                          aria-label={`${packet.orderRef} — ${DOC_TAB_LABEL[tab]}: ${SLOT_STATE_FACE[state].label}`}
                          data-testid={`docs-matrix-cell-${packet.orderId}-${tab}`}
                        >
                          <LifecycleCode state={SLOT_STATE_FACE[state]} />
                        </button>
                      </HoverTooltip>
                    </td>
                  );
                })}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LibraryPicker({ pending, onPick }: { pending: boolean; onPick: (manualId: number) => void }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(id);
  }, [query]);
  const library = useQuery({
    queryKey: ['paperwork-manual-library', debounced],
    queryFn: async () => {
      const res = await fetch(`/api/product-manuals/search?${new URLSearchParams({ q: debounced, limit: '30' })}`, { credentials: 'same-origin' });
      const body = (await res.json().catch(() => ({}))) as { manuals?: LibraryManual[] };
      return body.manuals ?? [];
    },
    staleTime: 60_000,
  });
  const options = (library.data ?? []).map((manual) => ({
    value: manual.id,
    label: manual.display_name || manual.product_title || `Manual #${manual.id}`,
    meta: [manual.item_number ? `Item ${manual.item_number}` : null, manual.type].filter(Boolean).join(' · ') || undefined,
  }));
  return (
    <SearchableSelectField
      value={null}
      onChange={(next) => {
        if (next != null) onPick(Number(next));
      }}
      options={options}
      onSearchChange={setQuery}
      loading={library.isFetching}
      disabled={pending}
      placeholder={pending ? 'Linking…' : 'Search the library…'}
      searchPlaceholder="Name, SKU or item #…"
      emptyMessage="Nothing matching in the library"
      ariaLabel="Link one library document to the selected orders"
      testId="docs-matrix-library"
      className="w-full"
    />
  );
}
