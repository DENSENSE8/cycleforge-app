'use client';

/**
 * @domain-job Station Displays carton Macro verbs — More, optional Sync,
 *   optional Print, Edit, Delete — one equal-fill row above the column close.
 * @hardware-target Station
 * @density floor
 * @justification Cannot reuse InspectorActionFloor — C2 station Displays vs
 *   desk RightRailHost. This compound composes StationDisplaysActionFloor and
 *   optional Print/Sync slots so Unbox / Arrival / Testing stay thin recipes.
 *
 * Carton Macro compound over {@link StationDisplaysActionFloor}:
 *   [ ⋯ ][ Sync? ][ Print? ][ Edit ][ Delete ]
 *
 * Verb set is decided by slot presence, not taste:
 *   Unbox    — Print + Sync (5)
 *   Arrival  — Sync only (4)
 *   Testing  — neither (3)
 *
 * Never desk `InspectorActionFloor` / `FloorIconButton`.
 */

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  MoreHorizontal,
  Pencil,
  Printer,
  RefreshCw,
} from '@/components/Icons';
import { InspectorFlushDelete } from '@/components/right-rail/InspectorFlushDelete';
import { StationDisplaysActionFloor } from '@/components/station/displays/StationDisplaysActionFloor';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import {
  FLUSH_TERMINAL_SPREAD_GLYPH_CLASS,
  FLUSH_TERMINAL_SPREAD_PEER_CLASS,
} from '@/design-system/primitives/FlushTerminalFooter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { cornerClass } from '@/design-system/tokens/radius';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { removeReceivingRailByCarton } from '@/lib/queries/receiving-queries';
import {
  cartonFloorPeerOrder,
  cartonInventoryRefreshFeedback,
  stationDisplaysFloorMoreItems,
} from '@/lib/receiving/station-displays-carton-floor';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const FLUSH = cornerClass('flush');

/**
 * Macro fill-peer face — hover wash + optional inset underline.
 * Never SectionTabs `border-b-2` (that steals 2px from an h-11 floor and
 * clips stroke tips against the top hairline).
 */
const FLOOR_ICON_IDLE =
  'text-text-soft hover:bg-surface-hover hover:text-text-default';
const FLOOR_ICON_ACTIVE =
  'text-text-default shadow-[inset_0_-2px_0_0_currentColor]';

/** Fill-width Macro spread peer — hit target is the equal column (SoT). */
const FLOOR_ICON_CELL = cn(
  FLUSH,
  FLUSH_TERMINAL_SPREAD_PEER_CLASS,
  FLOOR_ICON_IDLE,
);

type CartonFloorPrintSlot = {
  canPrint: boolean;
  onPrint: () => void;
};

type CartonFloorSyncSlot = {
  onInventorySync?: () => void | Promise<unknown>;
  inventorySyncing?: boolean;
  canInventorySync?: boolean;
};

export function CartonDisplaysActionFloor({
  receivingId,
  isUnfound,
  onDeleted,
  editSelected = false,
  onEdit,
  onLink,
  testIdPrefix,
  print,
  sync,
}: {
  receivingId: number | null | undefined;
  isUnfound: boolean;
  onDeleted?: () => void;
  editSelected?: boolean;
  onEdit: () => void;
  /** Overflow Resolve when unfound. */
  onLink: () => void;
  /** `unbox` · `arrival` · `testing` — preserves existing data-testid prefixes. */
  testIdPrefix: 'unbox' | 'arrival' | 'testing';
  /** When set, paints the Print peer (Unbox). */
  print?: CartonFloorPrintSlot;
  /** When set, paints the Sync peer (Unbox · Arrival). */
  sync?: CartonFloorSyncSlot;
}) {
  const queryClient = useQueryClient();

  const moreItems = useMemo(
    () => stationDisplaysFloorMoreItems({ unfound: isUnfound }),
    [isUnfound],
  );

  const peers = cartonFloorPeerOrder({
    print: print != null,
    sync: sync != null,
  });

  const handlePrint = useCallback(() => {
    if (!print) return;
    if (!print.canPrint) {
      toast.info('Print is not available for this carton yet');
      return;
    }
    print.onPrint();
  }, [print]);

  const handleInventorySync = useCallback(async () => {
    if (!sync) return;
    const { onInventorySync, inventorySyncing, canInventorySync = true } = sync;
    if (!onInventorySync || inventorySyncing || !canInventorySync) return;
    const result = await onInventorySync();
    void queryClient.invalidateQueries({ queryKey: ['incoming-details'] });
    const feedback = cartonInventoryRefreshFeedback(result);
    if (feedback.kind === 'success') {
      if (feedback.description) {
        toast.success(feedback.title, { description: feedback.description });
      } else {
        toast.success(feedback.title);
      }
      return;
    }
    if (feedback.kind === 'warning') {
      toast.warning(feedback.title, { description: feedback.description });
      return;
    }
    toast.error(feedback.title, { description: feedback.description });
  }, [sync, queryClient]);

  const handleDelete = useCallback(async () => {
    if (receivingId == null) {
      toast.error('No carton to delete');
      throw new Error('No carton to delete');
    }
    const res = await fetch(
      `/api/receiving-logs?id=${encodeURIComponent(String(receivingId))}`,
      { method: 'DELETE' },
    );
    if (!res.ok && res.status !== 404) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      const msg = body?.error || `Delete failed (${res.status})`;
      toast.error(msg);
      throw new Error(msg);
    }
    removeReceivingRailByCarton(queryClient, receivingId);
    void queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
    emitReceiving('receiving-entry-deleted', receivingId);
    toast.success('Carton deleted');
  }, [receivingId, queryClient]);

  const runMoreItem = useCallback(
    (key: 'link') => {
      if (key === 'link') onLink();
    },
    [onLink],
  );

  if (receivingId == null) return null;

  const inventorySyncing = Boolean(sync?.inventorySyncing);
  const syncDisabled =
    !sync?.onInventorySync ||
    sync.canInventorySync === false ||
    inventorySyncing;

  return (
    <StationDisplaysActionFloor>
      {peers.map((peer) => {
        switch (peer) {
          case 'more':
            return (
              <DropdownMenu key="more">
                <DropdownMenuTrigger asChild>
                  <IconButton
                    type="button"
                    size="fill"
                    tone="neutral"
                    icon={
                      <MoreHorizontal className={FLUSH_TERMINAL_SPREAD_GLYPH_CLASS} />
                    }
                    disabled={moreItems.length === 0}
                    ariaLabel="More actions"
                    title="More actions"
                    className={FLOOR_ICON_CELL}
                    data-testid={`${testIdPrefix}-displays-floor-more`}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {moreItems.map((item) => (
                    <DropdownMenuItem
                      key={item.key}
                      onSelect={() => runMoreItem(item.key)}
                    >
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          case 'sync':
            return (
              <HoverTooltip
                key="sync"
                asChild
                label={
                  inventorySyncing
                    ? 'Refreshing inventory…'
                    : 'Refresh inventory from Zoho (F5)'
                }
              >
                <IconButton
                  type="button"
                  size="fill"
                  tone="neutral"
                  icon={
                    inventorySyncing ? (
                      <Loader2
                        className={cn(
                          FLUSH_TERMINAL_SPREAD_GLYPH_CLASS,
                          'animate-spin',
                        )}
                      />
                    ) : (
                      <RefreshCw className={FLUSH_TERMINAL_SPREAD_GLYPH_CLASS} />
                    )
                  }
                  onClick={() => void handleInventorySync()}
                  disabled={syncDisabled}
                  ariaLabel={
                    inventorySyncing
                      ? 'Refreshing inventory'
                      : 'Refresh inventory'
                  }
                  aria-busy={inventorySyncing || undefined}
                  className={FLOOR_ICON_CELL}
                  data-testid={`${testIdPrefix}-displays-floor-inventory-sync`}
                />
              </HoverTooltip>
            );
          case 'print':
            return (
              <HoverTooltip key="print" asChild label="Print">
                <IconButton
                  type="button"
                  size="fill"
                  tone="neutral"
                  icon={<Printer className={FLUSH_TERMINAL_SPREAD_GLYPH_CLASS} />}
                  onClick={handlePrint}
                  disabled={!print?.canPrint}
                  ariaLabel="Print"
                  className={FLOOR_ICON_CELL}
                  data-testid={`${testIdPrefix}-displays-floor-primary`}
                />
              </HoverTooltip>
            );
          case 'edit':
            return (
              <HoverTooltip key="edit" asChild label="Edit">
                <IconButton
                  type="button"
                  size="fill"
                  tone="neutral"
                  icon={<Pencil className={FLUSH_TERMINAL_SPREAD_GLYPH_CLASS} />}
                  onClick={onEdit}
                  ariaLabel="Edit"
                  aria-pressed={editSelected}
                  className={cn(
                    FLOOR_ICON_CELL,
                    editSelected && FLOOR_ICON_ACTIVE,
                  )}
                  data-testid={`${testIdPrefix}-displays-floor-edit`}
                />
              </HoverTooltip>
            );
          case 'delete':
            return (
              <InspectorFlushDelete
                key="delete"
                onConfirm={handleDelete}
                onDeleted={onDeleted}
                label="Delete carton"
                confirmLabel="Click again to delete carton"
                data-testid={`${testIdPrefix}-displays-floor-delete`}
                className={cn(FLUSH_TERMINAL_SPREAD_PEER_CLASS, 'border-l-0')}
              />
            );
          default: {
            const _exhaustive: never = peer;
            return _exhaustive;
          }
        }
      })}
    </StationDisplaysActionFloor>
  );
}
