'use client';

/**
 * Unbox Station Displays carton Macro floor:
 *   [ ⋯ ][ Sync ][ Print ][ Edit ][ Delete ]
 *
 * Thin station recipe over {@link CartonDisplaysActionFloor} (Print + Sync).
 * Never desk `InspectorActionFloor`.
 */

import { CartonDisplaysActionFloor } from '@/components/station/displays';
import type { InventoryDossierRefreshResult } from './hooks/useZohoSync';
import type {
  UnboxLinkageAction,
  UnboxPhotoAction,
  UnboxSideTab,
} from './unbox-side-tabs';

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
  return (
    <CartonDisplaysActionFloor
      testIdPrefix="unbox"
      receivingId={receivingId}
      isUnfound={isUnfound}
      onDeleted={onDeleted}
      editSelected={editSelected}
      onEdit={() => {
        if (isUnfound) {
          openDisplays('linkage', { linkageAction: 'link' });
          return;
        }
        openDisplays('linkage', { linkageAction: 'actions' });
      }}
      onLink={() => openDisplays('linkage', { linkageAction: 'link' })}
      print={{ canPrint, onPrint: runPrintLabel }}
      sync={{ onInventorySync, inventorySyncing, canInventorySync }}
    />
  );
}
