/**
 * Why a label is on an order, and how it got there — the vocabulary and the
 * pure rules for the order's label list (`shipping_label_purchases`, migration
 * 2026-09-24j). Client-safe: no DB imports.
 *
 *   purpose        outbound     — the order's shipment to the buyer (default)
 *                  return       — the buyer's parcel back to us (ShipStation
 *                                 `isReturnLabel`, or bought here as a return)
 *                  replacement  — a second shipment to the buyer for the SAME
 *                                 order (a replacement unit / a re-send)
 *   creation type  bought_in_app        — bought in the Labels walk
 *                  imported_shipstation — the ShipStation label backfill
 *                  linked_manually      — an operator paired it (Link label)
 *
 * One order carries any number of labels; each keeps the order's number and
 * name — the purpose and creation type are what tell them apart.
 */

export const LABEL_PURPOSES = ['outbound', 'return', 'replacement'] as const;
export type LabelPurpose = (typeof LABEL_PURPOSES)[number];

export const LABEL_CREATION_TYPES = ['bought_in_app', 'imported_shipstation', 'linked_manually'] as const;
export type LabelCreationType = (typeof LABEL_CREATION_TYPES)[number];

/** Ledger row status — `unlinked` rows stay so the backfill never re-imports them. */
export type LabelLedgerStatus = 'pending' | 'purchased' | 'voided' | 'unlinked';

export const LABEL_PURPOSE_FACE: Readonly<Record<LabelPurpose, { label: string; code: string }>> = {
  outbound: { label: 'Outbound', code: 'OUT' },
  return: { label: 'Return', code: 'RTN' },
  replacement: { label: 'Replacement', code: 'RPL' },
};

export const LABEL_CREATION_FACE: Readonly<Record<LabelCreationType, { label: string; verb: string }>> = {
  bought_in_app: { label: 'Bought here', verb: 'Bought' },
  imported_shipstation: { label: 'Imported · ShipStation', verb: 'Imported' },
  linked_manually: { label: 'Linked', verb: 'Linked' },
};

export function isLabelPurpose(value: unknown): value is LabelPurpose {
  return typeof value === 'string' && (LABEL_PURPOSES as readonly string[]).includes(value);
}

export function isLabelCreationType(value: unknown): value is LabelCreationType {
  return typeof value === 'string' && (LABEL_CREATION_TYPES as readonly string[]).includes(value);
}

/**
 * Does a label of this purpose become part of the order's tracking set?
 * Outbound and replacement parcels travel to the buyer — their tracking is the
 * order's. A return travels to us; it never joins the order's tracking.
 */
export function purposeLinksOrderTracking(purpose: LabelPurpose): boolean {
  return purpose !== 'return';
}

/** The v1 shipment id behind a ShipStation v2 label id (`se-<shipmentId>`). */
export function shipmentIdFromLabelId(labelId: string | null | undefined): number | null {
  const match = /^se-(\d+)$/.exec(String(labelId ?? '').trim());
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// ─── Link ────────────────────────────────────────────────────────────────────

/** Everything the link decision knows about one ShipStation label (server-resolved). */
export interface LabelLinkFacts {
  labelId: string;
  voided: boolean;
  /** ShipStation flags it as a return label. */
  isReturnLabel: boolean;
  /** Its label-ingestion row, when the backfill recorded it. */
  ingestion: { id: number; state: string; matchedOrderId: number | null } | null;
  /** The live (pending/purchased) ledger row for this label id, on any order. */
  liveRow: { id: number; orderId: number | null; purpose: LabelPurpose } | null;
}

export type LabelLinkDecision =
  | {
      kind: 'create';
      purpose: LabelPurpose;
      /** QUARANTINED ingestion to resolve as LINKED with this order. */
      resolveIngestionId: number | null;
      /** Add the label's tracking to the order's tracking set. */
      linkTracking: boolean;
    }
  | { kind: 'replay'; rowId: number }
  | { kind: 'refuse'; status: 400 | 409; code: string; message: string };

/**
 * May this ShipStation label be paired to `orderId` with `purpose`?
 *
 *   voided label                         → 409 (nothing to ship with)
 *   ShipStation return label, not Return → 400 (the label says what it is)
 *   already live on THIS order           → replay (same purpose) / 409 (other purpose)
 *   already live on ANOTHER order        → 409 (a label belongs to one order)
 *   ingestion APPLIED to another order   → 409
 *   ingestion MATCHED / APPLYING         → 409 (the backfill is attaching it now)
 *   ingestion QUARANTINED                → create, resolving it as LINKED
 */
export function decideLabelLink(
  orderId: number,
  purpose: LabelPurpose,
  facts: LabelLinkFacts,
): LabelLinkDecision {
  if (facts.voided) {
    return { kind: 'refuse', status: 409, code: 'LABEL_VOIDED', message: `${facts.labelId} is voided in ShipStation.` };
  }
  if (facts.isReturnLabel && purpose !== 'return') {
    return {
      kind: 'refuse',
      status: 400,
      code: 'RETURN_LABEL_PURPOSE',
      message: 'ShipStation marks this as a return label — link it as Return.',
    };
  }
  if (facts.liveRow) {
    if (facts.liveRow.orderId !== orderId) {
      return {
        kind: 'refuse',
        status: 409,
        code: 'LABEL_LINKED_ELSEWHERE',
        message: 'This label is already on another order — unlink it there first.',
      };
    }
    if (facts.liveRow.purpose !== purpose) {
      return {
        kind: 'refuse',
        status: 409,
        code: 'LABEL_PURPOSE_CONFLICT',
        message: `Already on this order as ${LABEL_PURPOSE_FACE[facts.liveRow.purpose].label} — unlink it to change its purpose.`,
      };
    }
    return { kind: 'replay', rowId: facts.liveRow.id };
  }
  const ingestion = facts.ingestion;
  if (ingestion) {
    if (ingestion.state === 'APPLIED' && ingestion.matchedOrderId != null && ingestion.matchedOrderId !== orderId) {
      return {
        kind: 'refuse',
        status: 409,
        code: 'LABEL_LINKED_ELSEWHERE',
        message: 'The ShipStation import already attached this label to another order.',
      };
    }
    if (ingestion.state === 'MATCHED' || ingestion.state === 'APPLYING') {
      return {
        kind: 'refuse',
        status: 409,
        code: 'LABEL_IMPORT_IN_FLIGHT',
        message: 'The ShipStation import matched this label and is attaching it — run the backfill to finish it.',
      };
    }
  }
  return {
    kind: 'create',
    purpose,
    resolveIngestionId: ingestion?.state === 'QUARANTINED' ? ingestion.id : null,
    linkTracking: purposeLinksOrderTracking(purpose),
  };
}

// ─── Unlink ──────────────────────────────────────────────────────────────────

export interface LabelUnlinkFacts {
  status: LabelLedgerStatus;
  creationType: LabelCreationType;
  purpose: LabelPurpose;
  /** State of the ingestion row the label came from, if any. */
  ingestionState: string | null;
}

export type LabelUnlinkDecision =
  | { kind: 'unlink'; reopenIngestion: boolean; unlinkTracking: boolean }
  | { kind: 'replay' }
  | { kind: 'refuse'; status: 409; code: string; message: string };

/**
 * May this label come off the order?
 *
 *   already unlinked                 → replay
 *   bought here                      → 409 (void it — that refunds it)
 *   the import's APPLIED primary     → 409 (it IS the order's tracking + label doc)
 *   otherwise                        → unlink; a LINKED ingestion reopens as
 *                                      QUARANTINED; tracking the pairing added
 *                                      (outbound / replacement) comes off too.
 */
export function decideLabelUnlink(facts: LabelUnlinkFacts): LabelUnlinkDecision {
  if (facts.status === 'unlinked') return { kind: 'replay' };
  if (facts.creationType === 'bought_in_app') {
    return { kind: 'refuse', status: 409, code: 'LABEL_BOUGHT_HERE', message: 'Bought here — void the label instead.' };
  }
  if (facts.ingestionState === 'APPLIED') {
    return {
      kind: 'refuse',
      status: 409,
      code: 'LABEL_IS_PRIMARY_IMPORT',
      message: "This is the order's imported primary label — replace the tracking instead.",
    };
  }
  return {
    kind: 'unlink',
    reopenIngestion: facts.ingestionState === 'LINKED',
    unlinkTracking: facts.creationType === 'linked_manually' && purposeLinksOrderTracking(facts.purpose),
  };
}
