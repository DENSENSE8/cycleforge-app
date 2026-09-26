'use client';

/**
 * The History face's wire — every call the tablet makes for a past visit.
 * same way the desk's staff switcher does (operator 2026-09-22 — *"remove the
 */

import { kioskFetchHealed } from '@/lib/kiosk/kiosk-self-heal';
import {
  parseKioskHistoryKey,
  type KioskHistorySource,
} from '@/lib/counter/kiosk-history-key';
import type { KioskVisitRow, KioskVisitKindFilter } from '@/lib/counter/list-kiosk-visits';
import type { CounterVisit } from '@/lib/counter/read-visit';
import type { KioskRepairHeader } from '@/lib/counter/read-repair-ticket';
import type { VisitRepairProvenance } from '@/lib/counter/visit-provenance';

export { parseKioskHistoryKey };
export type {
  KioskHistorySource,
  KioskVisitRow,
  KioskVisitKindFilter,
  CounterVisit,
  KioskRepairHeader,
  VisitRepairProvenance,
};

/** Who the tablet is signed in as, for the duration of the History face. */
export interface KioskStaffActor {
  staffId: number;
  name?: string;
}

/**
 * One opened history row. Exactly one of `visit` / `repair` is present: a
 * counter visit carries money, lines and a receipt; a standalone repair carries
 * the ticket's own facts and nothing it never had.
 */
export interface KioskVisitDetail {
  visit: CounterVisit | null;
  repair: KioskRepairHeader | null;
  provenance: VisitRepairProvenance[];
}

export interface KioskVisitListResult {
  visits: KioskVisitRow[];
  nextCursor: string | null;
  /** The strict search found nothing; these rows are near-name matches. */
  relaxed: boolean;
  /** The name that was relaxed, for the rail's notice. Null unless `relaxed`. */
  relaxedTerm: string | null;
}

export interface KioskVisitEditInput {
  customer?: { name?: string; phone?: string; email?: string };
  devices?: Array<{ repairId: number; serialNumber?: string; issue?: string; notes?: string }>;
}

/** Errors the face SHOWS. Anything else is "could not …" — never a raw body. */
export class KioskHistoryError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = 'KioskHistoryError';
    this.code = code;
    this.status = status;
  }
}

const MESSAGE_BY_CODE: Record<string, string> = {
  UNKNOWN_STAFF: 'That staff member is no longer active on this tablet.',
  FIELD_NOT_EDITABLE: 'That field cannot be edited from this tablet.',
  PHONE_CONFLICT: 'Another customer already has that phone number.',
  DEVICE_NOT_IN_VISIT: 'That device is not part of this visit.',
  NOT_FOUND: 'That record is no longer available.',
};

async function readError(res: Response, fallback: string): Promise<KioskHistoryError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  const code = body.error ?? 'REQUEST_FAILED';
  return new KioskHistoryError(code, res.status, MESSAGE_BY_CODE[code] ?? fallback);
}

export async function fetchKioskVisits(params: {
  q?: string;
  kind?: KioskVisitKindFilter;
  cursor?: string | null;
  signal?: AbortSignal;
}): Promise<KioskVisitListResult> {
  const query = new URLSearchParams();
  if (params.q?.trim()) query.set('q', params.q.trim());
  if (params.kind && params.kind !== 'all') query.set('kind', params.kind);
  if (params.cursor) query.set('cursor', params.cursor);
  const res = await kioskFetchHealed(`/api/kiosk/visit?${query.toString()}`, {
    cache: 'no-store',
    signal: params.signal,
  });
  if (!res.ok) throw await readError(res, 'Could not load visit history.');
  return (await res.json()) as KioskVisitListResult;
}

/**
 * One row, by its rail key. `repair:` keys read the ticket route — the visit
 * route would 404 on a drop-off that never became a transaction, which is most
 * of the book.
 */
export async function fetchKioskHistoryDetail(
  key: string,
  signal?: AbortSignal,
): Promise<KioskVisitDetail> {
  const handle = parseKioskHistoryKey(key);
  if (!handle) throw new KioskHistoryError('INVALID_KEY', 400, 'That record is no longer available.');
  const path =
    handle.source === 'repair'
      ? `/api/kiosk/repair/${handle.id}`
      : `/api/kiosk/visit/${handle.id}`;
  const res = await kioskFetchHealed(path, { cache: 'no-store', signal });
  if (!res.ok) throw await readError(res, 'Could not load that record.');
  return (await res.json()) as KioskVisitDetail;
}

export async function patchKioskVisit(args: {
  visitId: number;
  actor: KioskStaffActor;
  edit: KioskVisitEditInput;
}): Promise<KioskVisitDetail & { changed: string[] }> {
  const res = await kioskFetchHealed(`/api/kiosk/visit/${args.visitId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffId: args.actor.staffId, ...args.edit }),
  });
  if (!res.ok) throw await readError(res, 'Could not save that change.');
  const body = (await res.json()) as Omit<KioskVisitDetail, 'repair'> & { changed: string[] };
  // The visit route answers with the transaction only: editing is a visit-only
  // act, so there is never a ticket header to carry back.
  return { ...body, repair: null };
}

/** Record that a repair label was reprinted. */
export async function stampKioskLabelPrinted(args: {
  visitId: number | null;
  repairId: number;
  actor: KioskStaffActor;
}): Promise<{ labelPrintedAt: string | null; alreadyPrinted: boolean }> {
  const path =
    args.visitId == null
      ? `/api/kiosk/repair/${args.repairId}/label-printed`
      : `/api/kiosk/visit/${args.visitId}/label-printed`;
  const body =
    args.visitId == null
      ? { staffId: args.actor.staffId }
      : { repairId: args.repairId, staffId: args.actor.staffId };
  const res = await kioskFetchHealed(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res, 'The label printed, but the reprint was not recorded.');
  return (await res.json()) as { labelPrintedAt: string | null; alreadyPrinted: boolean };
}

/**
 * Open the repair's own letterhead form in a print window. Same document the
 * desk prints from `/api/repair-service/print/[id]` — one renderer, two
 * principals — so a counter reprint and a desk reprint are the same paper.
 */
export function openKioskRepairPaperwork(repairId: number): void {
  window.open(`/api/kiosk/repair/${repairId}/paperwork`, '_blank', 'noopener,noreferrer');
}

/** Open the visit receipt in its own print window — the existing renderer. */
export function openKioskVisitReceipt(visitId: number, opts?: { staffCopy?: boolean }): void {
  const copy = opts?.staffCopy ? '&copy=staff' : '';
  window.open(
    `/api/kiosk/visit/${visitId}/receipt?print=1&reprint=1${copy}`,
    '_blank',
    'noopener,noreferrer',
  );
}
