'use client';

/** @domain-job Station Displays carton Macro verbs — optional Refresh, optional Print, Edit, and a trailing `⋯` holding Resolve + Delete —… */

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  MoreVertical,
  Pencil,
  Printer,
  RefreshCw,
} from '@/components/Icons';
import {
  StationDisplaysHeaderActions,
  STATION_DISPLAYS_HEADER_ACTION_ACTIVE,
  STATION_DISPLAYS_HEADER_ACTION_CELL,
  STATION_DISPLAYS_HEADER_ACTION_FACE,
  STATION_DISPLAYS_HEADER_ACTION_GLYPH,
} from '@/components/station/displays/StationDisplaysHeaderActions';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { cornerClass } from '@/design-system/tokens/radius';
import { emitReceiving } from '@/components/receiving/receiving-events';
import {
  removeReceivingRailByCarton,
  restoreReceivingRailSnapshot,
  snapshotReceivingRailByCarton,
} from '@/lib/queries/receiving-queries';
import {
  CARTON_DELETE_UNDO_MS,
  scheduleCartonDeleteUndo,
  undoCartonDelete,
} from '@/lib/receiving/carton-delete-undo';
import {
  cartonDeleteFace,
  cartonDeleteLabels,
  cartonFloorPeerOrder,
  cartonInventoryRefreshFeedback,
  stationDisplaysFloorMoreItems,
  type CartonDeleteIdentity,
} from '@/lib/receiving/station-displays-carton-floor';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const FLUSH = cornerClass('flush');

/** Top-band verb face — hover wash, no travel. */
const FLOOR_ICON_FACE = cn(FLUSH, STATION_DISPLAYS_HEADER_ACTION_FACE);

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
  deleteIdentity,
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
  /** Tracking / PO for arm copy + undo toast. Falls back to carton id. */
  deleteIdentity?: Omit<CartonDeleteIdentity, 'receivingId'> | null;
}) {
  const queryClient = useQueryClient();

  /**
   * Carton noun for the Delete row + undo toast. Computed here (not after the
   * `receivingId == null` early return) so the `⋯` memo stays hook-safe.
   */
  const deleteFace = useMemo(
    () =>
      receivingId == null
        ? ''
        : cartonDeleteFace({
            receivingId,
            tracking: deleteIdentity?.tracking,
            poNumber: deleteIdentity?.poNumber,
          }),
    [receivingId, deleteIdentity],
  );

  const moreItems = useMemo(
    () =>
      stationDisplaysFloorMoreItems({
        unfound: isUnfound,
        deleteLabel: cartonDeleteLabels(deleteFace).idleLabel,
      }),
    [isUnfound, deleteFace],
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
    const face = cartonDeleteFace({
      receivingId,
      tracking: deleteIdentity?.tracking,
      poNumber: deleteIdentity?.poNumber,
    });
    const labels = cartonDeleteLabels(face);
    const snapshot = snapshotReceivingRailByCarton(queryClient, receivingId);
    removeReceivingRailByCarton(queryClient, receivingId);
    emitReceiving('receiving-entry-deleted', receivingId);
    onDeleted?.();

    scheduleCartonDeleteUndo(receivingId, async () => {
      const res = await fetch(
        `/api/receiving-logs?id=${encodeURIComponent(String(receivingId))}`,
        { method: 'DELETE' },
      );
      if (!res.ok && res.status !== 404) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        const msg = body?.error || `Delete failed (${res.status})`;
        restoreReceivingRailSnapshot(queryClient, snapshot);
        toast.error(msg);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['receiving-lines-table'] });
    });

    toast.success(labels.deletedTitle, {
      duration: CARTON_DELETE_UNDO_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          if (!undoCartonDelete(receivingId)) return;
          restoreReceivingRailSnapshot(queryClient, snapshot);
          toast.success(`${face} restored`);
        },
      },
    });
  }, [receivingId, queryClient, onDeleted, deleteIdentity]);

  const runMoreItem = useCallback(
    (key: 'link' | 'delete') => {
      if (key === 'link') {
        onLink();
        return;
      }
      void handleDelete();
    },
    [onLink, handleDelete],
  );

  if (receivingId == null) return null;

  const inventorySyncing = Boolean(sync?.inventorySyncing);
  const syncDisabled =
    !sync?.onInventorySync ||
    sync.canInventorySync === false ||
    inventorySyncing;

  return (
    <StationDisplaysHeaderActions data-testid={`${testIdPrefix}-displays-header-actions`}>
      {peers.map((peer) => {
        switch (peer) {
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
                <span className={STATION_DISPLAYS_HEADER_ACTION_CELL}>
                  <IconButton
                    type="button"
                    size="sm"
                    tone="neutral"
                    icon={
                      inventorySyncing ? (
                        <Loader2
                          className={cn(
                            STATION_DISPLAYS_HEADER_ACTION_GLYPH,
                            'animate-spin',
                          )}
                        />
                      ) : (
                        <RefreshCw className={STATION_DISPLAYS_HEADER_ACTION_GLYPH} />
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
                    className={FLOOR_ICON_FACE}
                    data-testid={`${testIdPrefix}-displays-floor-inventory-sync`}
                  />
                </span>
              </HoverTooltip>
            );
          case 'print':
            return (
              <HoverTooltip key="print" asChild label="Print">
                <span className={STATION_DISPLAYS_HEADER_ACTION_CELL}>
                  <IconButton
                    type="button"
                    size="sm"
                    tone="neutral"
                    icon={<Printer className={STATION_DISPLAYS_HEADER_ACTION_GLYPH} />}
                    onClick={handlePrint}
                    disabled={!print?.canPrint}
                    ariaLabel="Print"
                    className={FLOOR_ICON_FACE}
                    data-testid={`${testIdPrefix}-displays-floor-primary`}
                  />
                </span>
              </HoverTooltip>
            );
          case 'edit':
            return (
              <HoverTooltip key="edit" asChild label="Edit">
                <span className={STATION_DISPLAYS_HEADER_ACTION_CELL}>
                  <IconButton
                    type="button"
                    size="sm"
                    tone="neutral"
                    icon={<Pencil className={STATION_DISPLAYS_HEADER_ACTION_GLYPH} />}
                    onClick={onEdit}
                    ariaLabel="Edit"
                    aria-pressed={editSelected}
                    className={cn(
                      FLOOR_ICON_FACE,
                      editSelected && STATION_DISPLAYS_HEADER_ACTION_ACTIVE,
                    )}
                    data-testid={`${testIdPrefix}-displays-floor-edit`}
                  />
                </span>
              </HoverTooltip>
            );
          case 'more':
            return (
              <DropdownMenu key="more">
                <DropdownMenuTrigger asChild>
                  <span className={STATION_DISPLAYS_HEADER_ACTION_CELL}>
                    <IconButton
                      type="button"
                      size="sm"
                      tone="neutral"
                      icon={
                        <MoreVertical
                          className={STATION_DISPLAYS_HEADER_ACTION_GLYPH}
                        />
                      }
                      ariaLabel="More actions"
                      title="More actions"
                      className={FLOOR_ICON_FACE}
                      data-testid={`${testIdPrefix}-displays-floor-more`}
                    />
                  </span>
                </DropdownMenuTrigger>
                {/* Trailing anchor — `⋯` is the last cell, so the panel opens
                    back under the column rather than off the pane edge. */}
                <DropdownMenuContent align="end">
                  {moreItems.map((item) => (
                    <DropdownMenuItem
                      key={item.key}
                      tone={item.tone === 'danger' ? 'danger' : 'default'}
                      onSelect={() => runMoreItem(item.key)}
                      data-testid={`${testIdPrefix}-displays-floor-${item.key}`}
                    >
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          default: {
            const _exhaustive: never = peer;
            return _exhaustive;
          }
        }
      })}
    </StationDisplaysHeaderActions>
  );
}
