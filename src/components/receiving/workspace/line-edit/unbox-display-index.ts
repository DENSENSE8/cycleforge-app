/** Unbox Displays Root Index — domain row builder (no React). */

import type { DisplayIndexGroup, DisplayIndexRow } from '@/components/station/displays';
import {
  UNBOX_STRIP_TAB_ORDER,
  isUnboxSideTabVisible,
  type UnboxSideTab,
  type UnboxSideTabGates,
} from './unbox-side-tabs';

export interface UnboxDisplayIndexSignals {
  hasTicketId: boolean;
  /** Carton photo count when known; `null` → generic subtitle. */
  photoCount: number | null;
  serialCount: number;
  /** Matched to a PO / inbound source (Linkage). */
  linkagePaired: boolean;
  isUnfound: boolean;
  trackingPresent: boolean;
  /**
   * Received / expected across PO lines when known (`null` → generic subtitle).
   * Used for the Inventory index row.
   */
  inventoryReceived?: number | null;
  inventoryExpected?: number | null;
}

const LABELS: Record<UnboxSideTab, string> = {
  checklist: 'Checklist',
  ticket: 'Ticket',
  photos: 'Photos',
  linkage: 'Pairing',
  inventory: 'Inventory',
  listings: 'Listings',
  units: 'Units',
  prebox: 'Prebox',
  tracking: 'Tracking',
  locations: 'Locations',
  timeline: 'Timeline',
};

/** PO-identity → stock → exceptions/history. */
const GROUPS: Record<UnboxSideTab, DisplayIndexGroup> = {
  checklist: 'verification',
  listings: 'verification',
  linkage: 'verification',
  inventory: 'assets',
  units: 'assets',
  prebox: 'assets',
  photos: 'assets',
  ticket: 'context',
  tracking: 'context',
  locations: 'context',
  timeline: 'context',
};

function ticketRow(signals: UnboxDisplayIndexSignals): Pick<DisplayIndexRow, 'subtitle' | 'tone'> {
  if (signals.hasTicketId) {
    return { subtitle: 'Linked ticket', tone: 'ok' };
  }
  // Quiet directory — filing/linking is the header Ticket task's job, not an
  // index amber alarm.
  return { subtitle: 'No ticket', tone: 'neutral' };
}

function photosRow(signals: UnboxDisplayIndexSignals): Pick<DisplayIndexRow, 'subtitle' | 'tone'> {
  const n = signals.photoCount;
  if (n == null) return { subtitle: 'Carton photos', tone: 'neutral' };
  if (n <= 0) return { subtitle: 'None', tone: 'neutral' };
  return {
    subtitle: n === 1 ? '1 photo' : `${n} photos`,
    tone: 'ok',
  };
}

function linkageRow(signals: UnboxDisplayIndexSignals): Pick<DisplayIndexRow, 'subtitle' | 'tone'> {
  if (signals.linkagePaired) {
    return { subtitle: 'Paired', tone: 'ok' };
  }
  if (signals.isUnfound) {
    return { subtitle: 'Unpaired', tone: 'action' };
  }
  return { subtitle: 'Pairing · PO note', tone: 'neutral' };
}

function inventoryRow(signals: UnboxDisplayIndexSignals): Pick<DisplayIndexRow, 'subtitle' | 'tone'> {
  if (!signals.linkagePaired) {
    return { subtitle: 'Unpaired', tone: 'action' };
  }
  const recv = signals.inventoryReceived;
  const exp = signals.inventoryExpected;
  if (typeof recv === 'number' && typeof exp === 'number' && exp > 0) {
    return {
      subtitle: `${recv}/${exp} received`,
      tone: recv >= exp ? 'ok' : 'neutral',
    };
  }
  return { subtitle: 'PO · lines · notes', tone: 'ok' };
}


function unitsRow(signals: UnboxDisplayIndexSignals): Pick<DisplayIndexRow, 'subtitle' | 'tone'> {
  const n = signals.serialCount;
  if (n <= 0) return { subtitle: 'No serials', tone: 'neutral' };
  return {
    subtitle: n === 1 ? '1 serial' : `${n} serials`,
    tone: 'ok',
  };
}

function preboxRow(signals: UnboxDisplayIndexSignals): Pick<DisplayIndexRow, 'subtitle' | 'tone'> {
  const n = signals.serialCount;
  if (n <= 0) return { subtitle: 'Need serials', tone: 'neutral' };
  // Quiet when serials exist — no "unit ready" chip and no Assets "N pending"
  // trailer (action tone drives the group summary).
  return { subtitle: '', tone: 'ok' };
}

function trackingRow(signals: UnboxDisplayIndexSignals): Pick<DisplayIndexRow, 'subtitle' | 'tone'> {
  if (signals.trackingPresent) {
    return { subtitle: 'Tracking on file', tone: 'ok' };
  }
  return { subtitle: 'No tracking', tone: 'neutral' };
}

function rowMeta(
  id: UnboxSideTab,
  signals: UnboxDisplayIndexSignals,
): Pick<DisplayIndexRow, 'subtitle' | 'tone'> {
  switch (id) {
    case 'checklist':
      return { subtitle: 'Procedure steps', tone: 'neutral' };
    case 'ticket':
      return ticketRow(signals);
    case 'photos':
      return photosRow(signals);
    case 'linkage':
      return linkageRow(signals);
    case 'inventory':
      return inventoryRow(signals);
    case 'listings':
      return { subtitle: 'Listing links', tone: 'neutral' };
    case 'units':
      return unitsRow(signals);
    case 'prebox':
      return preboxRow(signals);
    case 'tracking':
      return trackingRow(signals);
    case 'locations':
      // A directory, never an alarm: an unplaced carton is normal mid-unbox.
      return { subtitle: 'Place · print · mint', tone: 'neutral' };
    case 'timeline':
      return { subtitle: 'Status history · audit', tone: 'neutral' };
  }
}

/**
 * Build visible Root Index rows for the current carton gates + signals.
 * Order matches {@link UNBOX_STRIP_TAB_ORDER}.
 */
export function buildUnboxDisplayIndexRows(
  gates: UnboxSideTabGates,
  signals: UnboxDisplayIndexSignals,
): DisplayIndexRow[] {
  const rows: DisplayIndexRow[] = [];
  for (const id of UNBOX_STRIP_TAB_ORDER) {
    if (!isUnboxSideTabVisible(id, gates)) continue;
    const meta = rowMeta(id, signals);
    rows.push({
      id,
      label: LABELS[id],
      subtitle: meta.subtitle,
      tone: meta.tone,
      group: GROUPS[id],
    });
  }
  return rows;
}
