'use client';

/**
 * Arrival (Receiving triage) Station Displays carton Macro floor:
 *   [ ⋯ ][ Sync ][ Edit ][ Delete ]
 *
 * Station-side mirror of {@link UnboxDisplaysActionFloor} — the SAME equal
 * fill-width peer shell ({@link StationDisplaysActionFloor} + `IconButton
 * size="fill"` / {@link FLUSH_TERMINAL_SPREAD_PEER_CLASS}), seated **above** the
 * column close chrome (`→|` / Filter hairline). Delete stays far-right; height
 * = dock Band 1 `h-11`.
 *
 * Arrival is the door / identify pass — there is no printable label yet (that
 * lives on the Unbox bench), so the floor has **no Print peer** (4 peers, not
 * Unbox's 5):
 *   ⋯ More (Resolve when unfound) · Sync (Zoho inventory, paired-PO only) ·
 *   Edit (→ Pairing) · Delete carton.
 *
 * C2 (`source-of-truth.md` → Scan vs desk right-edge): compose the STATION
 * shell + the shared presentational waist ({@link InspectorFlushDelete},
 * `FLUSH_TERMINAL_SPREAD_*`). **Never** the desk `InspectorActionFloor` /
 * `FloorIconButton` peers.
 */

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, MoreHorizontal, Pencil, RefreshCw } from '@/components/Icons';
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
import type { InventoryDossierRefreshResult } from '../workspace/line-edit/hooks/useZohoSync';
import type { TriageDisplayTab } from './build-triage-displays';

const FLUSH = cornerClass('flush');

/**
 * Macro fill-peer face — hover wash + optional inset underline. Never
 * SectionTabs `border-b-2` (steals 2px from an h-11 floor).
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

export function ArrivalDisplaysActionFloor({
  receivingId,
  isUnfound,
  openDisplays,
  onDeleted,
  editSelected = false,
  onInventorySync,
  inventorySyncing = false,
  canInventorySync = true,
}: {
  receivingId: number | null | undefined;
  isUnfound: boolean;
  /** Arrival Displays = Ticket + Pairing — Edit / Resolve open the Pairing leaf. */
  openDisplays: (tab: TriageDisplayTab) => void;
  /** After successful delete — close Displays / workspace. */
  onDeleted?: () => void;
  /** Underline Edit when the Pairing (linkage) leaf is open. */
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
    openDisplays('linkage');
  }, [openDisplays]);

  const runMoreItem = useCallback(
    (key: 'link') => {
      if (key === 'link') openDisplays('linkage');
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
            data-testid="arrival-displays-floor-more"
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
          data-testid="arrival-displays-floor-inventory-sync"
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
          data-testid="arrival-displays-floor-edit"
        />
      </HoverTooltip>

      <InspectorFlushDelete
        onConfirm={handleDelete}
        onDeleted={onDeleted}
        label="Delete carton"
        confirmLabel="Click again to delete carton"
        data-testid="arrival-displays-floor-delete"
        className={cn(FLUSH_TERMINAL_SPREAD_PEER_CLASS, 'border-l-0')}
      />
    </StationDisplaysActionFloor>
  );
}
