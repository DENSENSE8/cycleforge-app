'use client';

/**
 * Unbox Station Displays carton Macro floor:
 *   [ ⋯ ][ Sync ][ Print ][ Edit ][ Delete ]
 *
 * Seated **above** the column close chrome (`→|` / Filter hairline). Equal
 * fill-width peer columns (`IconButton size="fill"` /
 * `FLUSH_TERMINAL_SPREAD_PEER_CLASS`) — hit target is the column, never a
 * floating `w-11` island. Delete stays far-right. Height = dock Band 1 `h-11`.
 * Never desk `InspectorActionFloor`.
 *
 * Face = flush icon cells on card-white — More · RefreshCw (Zoho inventory
 * sync) · Printer · Pencil · Trash. Overflow `⋯` holds secondary verbs
 * (Resolve when unfound).
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
import { StationDisplaysActionFloor } from '@/components/station/displays';
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
import { stationDisplaysFloorMoreItems } from '@/lib/receiving/station-displays-carton-floor';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import type { InventoryDossierRefreshResult } from './hooks/useZohoSync';
import type {
  UnboxLinkageAction,
  UnboxPhotoAction,
  UnboxSideTab,
} from './unbox-side-tabs';

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

type OpenDisplaysFn = (
  tab: UnboxSideTab,
  opts?: { linkageAction?: UnboxLinkageAction; photoAction?: UnboxPhotoAction },
) => void;

export function UnboxDisplaysActionFloor({
  receivingId,
  isUnfound,
  canPrint,
  runPrintLabel,
  openDisplays,
  onDeleted,
  editSelected = false,
  onInventorySync,
  inventorySyncing = false,
  canInventorySync = true,
}: {
  receivingId: number | null | undefined;
  isUnfound: boolean;
  canPrint: boolean;
  runPrintLabel: () => void;
  openDisplays: OpenDisplaysFn;
  /** After successful delete — close Displays / workspace. */
  onDeleted?: () => void;
  /** Underline Edit when Linkage leaf is open. */
  editSelected?: boolean;
  /** Zoho inventory dossier pull (mirror sync-one + carton inventory-sync). */
  onInventorySync?: () => void | Promise<InventoryDossierRefreshResult | void>;
  inventorySyncing?: boolean;
  canInventorySync?: boolean;
}) {
  const queryClient = useQueryClient();

  const moreItems = useMemo(
    () => stationDisplaysFloorMoreItems({ unfound: isUnfound }),
    [isUnfound],
  );

  const handlePrint = useCallback(() => {
    if (!canPrint) {
      toast.info('Print is not available for this carton yet');
      return;
    }
    runPrintLabel();
  }, [canPrint, runPrintLabel]);

  const handleInventorySync = useCallback(async () => {
    if (!onInventorySync || inventorySyncing || !canInventorySync) return;
    const result = await onInventorySync();
    void queryClient.invalidateQueries({ queryKey: ['incoming-details'] });
    if (result && typeof result === 'object' && 'ok' in result) {
      if (result.ok) {
        toast.success('Inventory refreshed', {
          description: 'Pulled latest status, notes, and lines from inventory.',
        });
      } else if (result.painted) {
        toast.warning('Inventory status updated locally', {
          description: result.error,
        });
      } else {
        toast.error('Inventory refresh failed', {
          description: result.error,
        });
      }
      return;
    }
    toast.success('Inventory refreshed');
  }, [onInventorySync, inventorySyncing, canInventorySync, queryClient]);

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

  const openEdit = useCallback(() => {
    if (isUnfound) {
      openDisplays('linkage', { linkageAction: 'link' });
      return;
    }
    openDisplays('linkage', { linkageAction: 'actions' });
  }, [isUnfound, openDisplays]);

  const runMoreItem = useCallback(
    (key: 'link') => {
      if (key === 'link') {
        openDisplays('linkage', { linkageAction: 'link' });
      }
    },
    [openDisplays],
  );

  if (receivingId == null) return null;

  const syncDisabled =
    !onInventorySync || !canInventorySync || inventorySyncing;

  return (
    <StationDisplaysActionFloor>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            type="button"
            size="fill"
            tone="neutral"
            icon={<MoreHorizontal className={FLUSH_TERMINAL_SPREAD_GLYPH_CLASS} />}
            disabled={moreItems.length === 0}
            ariaLabel="More actions"
            title="More actions"
            className={FLOOR_ICON_CELL}
            data-testid="unbox-displays-floor-more"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {moreItems.map((item) => (
            <DropdownMenuItem key={item.key} onSelect={() => runMoreItem(item.key)}>
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <HoverTooltip
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
              <Loader2 className={cn(FLUSH_TERMINAL_SPREAD_GLYPH_CLASS, 'animate-spin')} />
            ) : (
              <RefreshCw className={FLUSH_TERMINAL_SPREAD_GLYPH_CLASS} />
            )
          }
          onClick={() => void handleInventorySync()}
          disabled={syncDisabled}
          ariaLabel={
            inventorySyncing ? 'Refreshing inventory' : 'Refresh inventory'
          }
          aria-busy={inventorySyncing || undefined}
          className={FLOOR_ICON_CELL}
          data-testid="unbox-displays-floor-inventory-sync"
        />
      </HoverTooltip>

      <HoverTooltip asChild label="Print">
        <IconButton
          type="button"
          size="fill"
          tone="neutral"
          icon={<Printer className={FLUSH_TERMINAL_SPREAD_GLYPH_CLASS} />}
          onClick={handlePrint}
          disabled={!canPrint}
          ariaLabel="Print"
          className={FLOOR_ICON_CELL}
          data-testid="unbox-displays-floor-primary"
        />
      </HoverTooltip>

      <HoverTooltip asChild label="Edit">
        <IconButton
          type="button"
          size="fill"
          tone="neutral"
          icon={<Pencil className={FLUSH_TERMINAL_SPREAD_GLYPH_CLASS} />}
          onClick={openEdit}
          ariaLabel="Edit"
          aria-pressed={editSelected}
          className={cn(
            FLOOR_ICON_CELL,
            editSelected && FLOOR_ICON_ACTIVE,
          )}
          data-testid="unbox-displays-floor-edit"
        />
      </HoverTooltip>

      <InspectorFlushDelete
        onConfirm={handleDelete}
        onDeleted={onDeleted}
        label="Delete carton"
        confirmLabel="Click again to delete carton"
        data-testid="unbox-displays-floor-delete"
        className={cn(FLUSH_TERMINAL_SPREAD_PEER_CLASS, 'border-l-0')}
      />
    </StationDisplaysActionFloor>
  );
}
