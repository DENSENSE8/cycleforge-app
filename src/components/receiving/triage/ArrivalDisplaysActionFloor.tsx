'use client';

/** Arrival (Receiving triage) Station Displays carton Macro floor: */

import { CartonDisplaysActionFloor } from '@/components/station/displays';
import type { InventoryDossierRefreshResult } from '../workspace/line-edit/hooks/useZohoSync';
import type { TriageDisplayTab } from './build-triage-displays';

export function ArrivalDisplaysActionFloor({
  receivingId,
  isUnfound,
  openDisplays,
  onDeleted,
  editSelected = false,
  onInventorySync,
  inventorySyncing = false,
  canInventorySync = true,
  deleteIdentity,
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
  deleteIdentity?: { tracking?: string | null; poNumber?: string | null } | null;
}) {
  return (
    <CartonDisplaysActionFloor
      testIdPrefix="arrival"
      receivingId={receivingId}
      isUnfound={isUnfound}
      onDeleted={onDeleted}
      editSelected={editSelected}
      deleteIdentity={deleteIdentity}
      onEdit={() => openDisplays('linkage')}
      onLink={() => openDisplays('linkage')}
      sync={{ onInventorySync, inventorySyncing, canInventorySync }}
    />
  );
}
