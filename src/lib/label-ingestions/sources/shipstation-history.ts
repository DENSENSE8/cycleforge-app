/**
 * ShipStation historical-label adapter → the label-ingestion ledger.
 *
 * Backfills the labels ShipStation bought over a window (default: the last 7
 * days) into `label_ingestions`, then attaches each resolved label's tracking
 * and PDF to its order through the same paths live labels use.
 *
 *   feed     v1 `GET /shipments` (createDateStart = window start). Voided
 *            labels are skipped; the primary label per order number is
 *            chosen by {@link planShipStationTracking} — the rule the order
 *            sync already applies. Return labels (`isReturnLabel`) never
 *            become the order's tracking: they land on the order's label list
 *            (`shipping_label_purchases`, purpose `return`, creation type
 *            `imported_shipstation`) under the same order-number rule.
 *   PDF      v2 `GET /v2/labels/se-<shipmentId>` → `label_download.pdf`, fetched
 *            with the v2 client (API key only ever sent to ShipStation hosts).
 *            Every v1 shipment has a v2 label under that id — including labels
 *            made in the ShipStation app (verified live 2026-09-24, 62/62).
 *   ledger   `recordShipStationLabelIngestion` stages the PDF in the ledger's
 *            object store (GCS, never the repository) and records the row,
 *            idempotent on the shipment id AND the PDF sha256.
 *   order    ShipStation's order number → the org's order rows: a legacy
 *            `shipstation` row wins, else every row carrying the number
 *            ({@link decideShipStationLabel}). No match, an order
 *            spread over several account sources, a second live label for the
 *            same order, or no order number at all → the row stays QUARANTINED
 *            with that reason. Nothing is guessed.
 *   attach   (apply only) MATCHED → tracking via the ShipStation tracking
 *            attach, PDF via the outbound document store, then the row is
 *            finalized APPLIED and recorded on the order's label list
 *            (outbound / imported_shipstation). Any failure leaves it MATCHED
 *            for the next run; an APPLIED label missing from the list is
 *            recorded on the next run.
 *
 * Re-running is a no-op for APPLIED rows, finishes MATCHED rows a crashed run
 * left behind, and promotes a QUARANTINED row whose order has since landed.
 * A QUARANTINED row an operator paired (Link label → state LINKED) is
 * resolved and left alone; a return label the order-label list already knows
 * (even one an operator unlinked) is never imported again.
 * Labels bought in-app (`shipping_label_purchases` with a stored document) are
 * skipped: the purchase flow already stored them.
 *
 * All IO is injected ({@link ShipStationHistoryDeps}); production wiring lives
 * in ./shipstation-history-deps.ts.
 */
import type { ShipStationV1Shipment } from '@/lib/shipping/shipstation/orders-v1';
import type { ShipStationLabelRecord } from '@/lib/shipping/shipstation/client';
import type { ShipStationOrderRow } from '@/lib/integrations/connectors/shipstation-tracking';
import { planShipStationTracking } from '@/lib/integrations/connectors/shipstation-tracking';
import { shipStationCarrierToStored } from '@/lib/shipping/carrier-resolution';
import { detectCarrier, normalizeTrackingNumber } from '@/lib/shipping/normalize';
import { isAggregatorSource } from '@/lib/orders/order-source-match';
import { MAX_LABEL_PDF_BYTES } from '../contracts';
import type { ExactOrderIdentity, LabelQuarantineReasonCode, ParsedLabelEvidence } from '../types';
import type { PublicLabelIngestion, ShipStationIngestionRecord, ShipStationLabelIngestionInput } from '../ingestion-service';

export const SHIPSTATION_EVIDENCE_VERSION = 'shipstation-api-v1';
export const DEFAULT_BACKFILL_DAYS = 7;

/** The v2 label id of a v1 shipment. */
export function shipStationLabelId(shipmentId: number): string {
  return `se-${shipmentId}`;
}

/** One live outbound label from the feed. */
export interface ShipStationLabelCandidate {
  shipmentId: number;
  labelId: string;
  orderNumber: string | null;
  trackingNumberRaw: string;
  trackingNumberNormalized: string;
  /** Stored carrier vocabulary (`USPS`, `UPS`, …); null = unmapped code. */
  carrier: string | null;
  /** ShipStation's own carrier / service codes and v1 costs, for the order's label list. */
  carrierCode: string | null;
  serviceCode: string | null;
  shipmentCost: number | null;
  insuranceCost: number | null;
  /** False when another live label of the same order is its primary. */
  primary: boolean;
}

/** A live return label from the feed — bound for the order's label list, never its tracking. */
export type ShipStationReturnCandidate = Omit<ShipStationLabelCandidate, 'primary' | 'trackingNumberRaw' | 'trackingNumberNormalized'> & {
  trackingNumberRaw: string | null;
};

export interface ShipStationHistoryPlan {
  candidates: ShipStationLabelCandidate[];
  returnLabels: ShipStationReturnCandidate[];
  seen: number;
  voided: number;
  returns: number;
  noTracking: number;
}

/** Reduce the v1 feed to live outbound labels (marking each order's primary) and live return labels. */
export function planShipStationHistory(shipments: readonly ShipStationV1Shipment[]): ShipStationHistoryPlan {
  const primaries = new Set(planShipStationTracking(shipments).plans.map((p) => p.shipmentId));
  const plan: ShipStationHistoryPlan = { candidates: [], returnLabels: [], seen: shipments.length, voided: 0, returns: 0, noTracking: 0 };
  const seenIds = new Set<number>();
  for (const s of shipments) {
    if (seenIds.has(s.shipmentId)) continue;
    seenIds.add(s.shipmentId);
    if (s.voided) { plan.voided += 1; continue; }
    const money = {
      carrierCode: s.carrierCode,
      serviceCode: s.serviceCode,
      shipmentCost: s.shipmentCost,
      insuranceCost: s.insuranceCost,
    };
    if (s.isReturnLabel) {
      plan.returns += 1;
      plan.returnLabels.push({
        shipmentId: s.shipmentId,
        labelId: shipStationLabelId(s.shipmentId),
        orderNumber: s.orderNumber?.trim() || null,
        trackingNumberRaw: s.trackingNumber?.trim() || null,
        carrier: shipStationCarrierToStored(s.carrierCode),
        ...money,
      });
      continue;
    }
    const raw = s.trackingNumber?.trim() ?? '';
    const normalized = raw ? normalizeTrackingNumber(raw) : '';
    if (!normalized) { plan.noTracking += 1; continue; }
    const orderNumber = s.orderNumber?.trim() || null;
    plan.candidates.push({
      shipmentId: s.shipmentId,
      labelId: shipStationLabelId(s.shipmentId),
      orderNumber,
      trackingNumberRaw: raw,
      trackingNumberNormalized: normalized,
      carrier: shipStationCarrierToStored(s.carrierCode),
      ...money,
      // No order number → no primary slot; it quarantines as TRACKING_ONLY anyway.
      primary: orderNumber != null && primaries.has(s.shipmentId),
    });
  }
  return plan;
}

export interface MatchedLabelDecision {
  kind: 'MATCHED';
  exactOrder: ExactOrderIdentity;
  orderIds: number[];
  /** Every matched row already carries this tracking — no attach needed. */
  trackingCurrent: boolean;
}

export type ShipStationLabelDecision = MatchedLabelDecision | { kind: 'QUARANTINED'; reason: LabelQuarantineReasonCode };

/**
 * Which order rows this label belongs to — exact, or an exception reason.
 * `rowsForOrderNumber`: every org row carrying the order number, any source.
 */
export function decideShipStationLabel(
  candidate: ShipStationLabelCandidate,
  rowsForOrderNumber: readonly ShipStationOrderRow[],
): ShipStationLabelDecision {
  if (!candidate.orderNumber) return { kind: 'QUARANTINED', reason: 'TRACKING_ONLY' };
  if (!candidate.primary) return { kind: 'QUARANTINED', reason: 'MULTI_PACKAGE_EVIDENCE' };
  // A legacy `shipstation` row wins, else every row for the number (same as the
  // retired `matchOrderRowsAcrossSources('shipstation', …)`).
  const legacy = rowsForOrderNumber.filter((r) => isAggregatorSource(r.accountSource));
  const rows = legacy.length > 0 ? legacy : [...rowsForOrderNumber];
  if (rows.length === 0) return { kind: 'QUARANTINED', reason: 'ORDER_NOT_FOUND' };
  const sources = new Set(rows.map((r) => String(r.accountSource ?? '').trim()));
  if (sources.size > 1) return { kind: 'QUARANTINED', reason: 'AMBIGUOUS_ORDER_MATCH' };
  const [accountSource] = sources;
  if (!accountSource) return { kind: 'QUARANTINED', reason: 'MISSING_ACCOUNT_CONTEXT' };
  return {
    kind: 'MATCHED',
    exactOrder: {
      accountSource,
      marketplaceOrderId: candidate.orderNumber,
      matchMethod: 'MARKETPLACE_ORDER_ID',
      cycleforgeReference: null,
    },
    orderIds: rows.map((r) => r.orderRowId).sort((a, b) => a - b),
    trackingCurrent: rows.every(
      (r) => r.currentTracking != null && normalizeTrackingNumber(r.currentTracking) === candidate.trackingNumberNormalized,
    ),
  };
}

/** Ledger evidence from ShipStation's own shipment record (no PDF text). */
export function shipStationLabelEvidence(candidate: ShipStationLabelCandidate): ParsedLabelEvidence {
  return {
    parserVersion: SHIPSTATION_EVIDENCE_VERSION,
    cycleforgeReference: null,
    marketplaceOrderId: candidate.orderNumber,
    accountSource: null,
    trackingNumberRaw: candidate.trackingNumberRaw,
    trackingNumberNormalized: candidate.trackingNumberNormalized,
    carrier: candidate.carrier ?? detectCarrier(candidate.trackingNumberNormalized),
    multiPackageEvidence: !candidate.primary,
  };
}

/** Why a label's PDF could not be taken (the label itself stays unrecorded). */
export type PdfUnavailableReason = 'LABEL_NOT_FOUND' | 'LABEL_VOIDED' | 'NO_PDF_URL' | 'DOWNLOAD_FAILED' | 'NOT_A_PDF';

/** Validate a downloaded label body; null = usable PDF. */
export function pdfProblem(bytes: Buffer): PdfUnavailableReason | null {
  if (bytes.length === 0 || bytes.length > MAX_LABEL_PDF_BYTES) return 'NOT_A_PDF';
  return bytes.subarray(0, 5).toString('ascii') === '%PDF-' ? null : 'NOT_A_PDF';
}

export type FetchedLabelPdf = { ok: true; bytes: Buffer } | { ok: false; problem: PdfUnavailableReason };

/** Read the v2 label for `labelId` and download its PDF. */
export async function fetchShipStationLabelPdf(
  deps: Pick<ShipStationHistoryDeps, 'getLabel' | 'downloadLabel'>,
  labelId: string,
): Promise<FetchedLabelPdf> {
  const label = await deps.getLabel(labelId);
  if (!label) return { ok: false, problem: 'LABEL_NOT_FOUND' };
  if (label.voided) return { ok: false, problem: 'LABEL_VOIDED' };
  const url = label.labelDownload.pdf;
  if (!url) return { ok: false, problem: 'NO_PDF_URL' };
  let bytes: Buffer;
  try {
    bytes = (await deps.downloadLabel(url)).buffer;
  } catch {
    return { ok: false, problem: 'DOWNLOAD_FAILED' };
  }
  const problem = pdfProblem(bytes);
  return problem ? { ok: false, problem } : { ok: true, bytes };
}

export interface ShipStationHistoryDeps {
  /** Every v1 shipment created at/after `since` (all pages). */
  listShipments(since: Date): Promise<ShipStationV1Shipment[]>;
  /** Ledger rows already recorded for these shipment ids. */
  findIngestions(shipmentIds: number[]): Promise<PublicLabelIngestion[]>;
  /** Org order rows carrying these order numbers, any account source. */
  findOrders(orderNumbers: string[]): Promise<ShipStationOrderRow[]>;
  /** Label ids the in-app purchase flow already stored a document for. */
  findPurchasedLabelIds(labelIds: string[]): Promise<Set<string>>;
  /**
   * Label ids the order-label list already knows from an import or an
   * operator pairing — in ANY status, so an operator's unlink sticks.
   */
  findListedLabelIds(labelIds: string[]): Promise<Set<string>>;
  /** Put a ShipStation label on its order's label list (imported_shipstation); idempotent per label. */
  recordListedLabel(input: ListedLabelInput): Promise<void>;
  getLabel(labelId: string): Promise<ShipStationLabelRecord | null>;
  downloadLabel(url: string): Promise<{ buffer: Buffer; contentType: string }>;
  recordIngestion(input: Omit<ShipStationLabelIngestionInput, 'organizationId'>): Promise<ShipStationIngestionRecord>;
  promoteQuarantined(
    ingestion: PublicLabelIngestion,
    evidence: ParsedLabelEvidence,
    exactOrder: ExactOrderIdentity,
  ): Promise<PublicLabelIngestion | null>;
  /** Register the tracking as the orders' primary (the ShipStation sync's attach). */
  attachTracking(input: { orderIds: number[]; trackingNumber: string; carrier: string | null }): Promise<void>;
  /** The shipping_tracking_numbers row of a normalized tracking number. */
  findShipmentRow(trackingNumberNormalized: string): Promise<number | null>;
  /** Store the PDF as the order's shipping_label document; idempotent per label. */
  storeLabelDocument(input: {
    orderId: number;
    orderRef: string;
    labelId: string;
    bytes: Buffer;
    trackingNumber: string;
    carrier: string | null;
  }): Promise<number>;
  markApplied(input: {
    ingestionId: number;
    expectedRowVersion: number;
    orderIds: number[];
    shipmentId: number;
    documentId: number;
  }): Promise<void>;
  onError?(shipmentId: number, error: unknown): void;
  now(): Date;
}

/** One ShipStation label bound for the order's label list. */
export interface ListedLabelInput {
  orderId: number;
  purpose: 'outbound' | 'return';
  labelId: string;
  shipmentId: number;
  trackingNumber: string | null;
  carrierCode: string | null;
  serviceCode: string | null;
  shipmentCost: number | null;
  insuranceCost: number | null;
  /** The APPLIED ingestion it came from (its STN row + document ride along). */
  ingestionId: number | null;
}

export interface ShipStationHistoryReport {
  mode: 'dry-run' | 'apply';
  since: string;
  shipmentsSeen: number;
  voidedSkipped: number;
  /** Live return labels in the feed. */
  returnLabels: number;
  /** Return labels put on their order's label list (dry-run: would be). */
  returnsListed: number;
  /** Return labels the order-label list already knows. */
  returnsKnown: number;
  /** Return labels whose order does not resolve, by reason. */
  returnsUnresolved: Partial<Record<LabelQuarantineReasonCode, number>>;
  /** APPLIED labels recorded on the order-label list (new applies + repairs). */
  listed: number;
  noTrackingSkipped: number;
  /** Stored already by the in-app label purchase flow. */
  purchasedInApp: number;
  /** Shipment already in the ledger, by its ledger state. */
  alreadyIngested: Record<string, number>;
  /** New labels whose v2 PDF downloaded as a valid PDF. */
  pdfFetchable: number;
  pdfUnavailable: Partial<Record<PdfUnavailableReason, number>>;
  /** New ledger rows (dry-run: would be). */
  ingested: number;
  /** Byte-identical PDF already ingested under another row. */
  duplicatePdf: number;
  /** QUARANTINED rows whose order now resolves (dry-run: would promote). */
  promoted: number;
  /** MATCHED labels whose tracking is set as the orders' primary (dry-run: would). */
  trackingAttached: number;
  /** MATCHED labels whose orders already carry this tracking. */
  trackingAlreadyCurrent: number;
  /** MATCHED labels finalized APPLIED with tracking + document (dry-run: would). */
  applied: number;
  /** Labels left in the exception state, by reason (new + still-quarantined). */
  unresolved: Partial<Record<LabelQuarantineReasonCode, number>>;
  /** Apply-mode failures (row stays as-is for the next run). */
  failed: number;
}

function bump<K extends string>(bag: Partial<Record<K, number>>, key: K): void {
  bag[key] = (bag[key] ?? 0) + 1;
}

export async function runShipStationLabelBackfill(
  input: { since: Date; apply: boolean },
  deps: ShipStationHistoryDeps,
): Promise<ShipStationHistoryReport> {
  const shipments = await deps.listShipments(input.since);
  const plan = planShipStationHistory(shipments);
  const report: ShipStationHistoryReport = {
    mode: input.apply ? 'apply' : 'dry-run',
    since: input.since.toISOString(),
    shipmentsSeen: plan.seen,
    voidedSkipped: plan.voided,
    returnLabels: plan.returns,
    returnsListed: 0,
    returnsKnown: 0,
    returnsUnresolved: {},
    listed: 0,
    noTrackingSkipped: plan.noTracking,
    purchasedInApp: 0,
    alreadyIngested: {},
    pdfFetchable: 0,
    pdfUnavailable: {},
    ingested: 0,
    duplicatePdf: 0,
    promoted: 0,
    trackingAttached: 0,
    trackingAlreadyCurrent: 0,
    applied: 0,
    unresolved: {},
    failed: 0,
  };
  const { candidates, returnLabels } = plan;
  if (candidates.length === 0 && returnLabels.length === 0) return report;

  const allLabelIds = [...candidates.map((c) => c.labelId), ...returnLabels.map((r) => r.labelId)];
  const [ledger, orderRows, purchased, listed] = await Promise.all([
    deps.findIngestions(candidates.map((c) => c.shipmentId)),
    deps.findOrders([
      ...new Set([...candidates, ...returnLabels].flatMap((c) => (c.orderNumber ? [c.orderNumber] : []))),
    ]),
    deps.findPurchasedLabelIds(allLabelIds),
    deps.findListedLabelIds(allLabelIds),
  ]);
  const ledgerByShipment = new Map(ledger.map((row) => [row.shipstationShipmentId, row]));
  const rowsByNumber = new Map<string, ShipStationOrderRow[]>();
  for (const row of orderRows) {
    const list = rowsByNumber.get(row.orderNumber);
    if (list) list.push(row);
    else rowsByNumber.set(row.orderNumber, [row]);
  }

  const listedInput = (
    label: ShipStationLabelCandidate | ShipStationReturnCandidate,
    orderId: number,
    purpose: ListedLabelInput['purpose'],
    ingestionId: number | null,
  ): ListedLabelInput => ({
    orderId,
    purpose,
    labelId: label.labelId,
    shipmentId: label.shipmentId,
    trackingNumber: label.trackingNumberRaw,
    carrierCode: label.carrierCode,
    serviceCode: label.serviceCode,
    shipmentCost: label.shipmentCost,
    insuranceCost: label.insuranceCost,
    ingestionId,
  });

  /** Attach tracking + document to a MATCHED row and finalize it APPLIED. */
  const finish = async (
    candidate: ShipStationLabelCandidate,
    decision: MatchedLabelDecision,
    ingestion: PublicLabelIngestion | null,
    bytes: Buffer | null,
  ): Promise<void> => {
    if (decision.trackingCurrent) report.trackingAlreadyCurrent += 1;
    if (!input.apply || !ingestion) {
      if (!decision.trackingCurrent) report.trackingAttached += 1;
      report.applied += 1;
      report.listed += 1;
      return;
    }
    try {
      if (!decision.trackingCurrent) {
        await deps.attachTracking({
          orderIds: decision.orderIds,
          trackingNumber: candidate.trackingNumberRaw,
          carrier: candidate.carrier,
        });
        report.trackingAttached += 1;
      }
      const shipmentRowId = await deps.findShipmentRow(candidate.trackingNumberNormalized);
      if (shipmentRowId == null) throw new Error(`no shipment row for tracking ${candidate.trackingNumberRaw}`);
      let pdf = bytes;
      if (!pdf) {
        const fetched = await fetchShipStationLabelPdf(deps, candidate.labelId);
        if (!fetched.ok) throw new Error(`label PDF unavailable for ${candidate.labelId}: ${fetched.problem}`);
        pdf = fetched.bytes;
      }
      const documentId = await deps.storeLabelDocument({
        orderId: decision.orderIds[0]!,
        orderRef: candidate.orderNumber!,
        labelId: candidate.labelId,
        bytes: pdf,
        trackingNumber: candidate.trackingNumberRaw,
        carrier: candidate.carrier,
      });
      await deps.markApplied({
        ingestionId: ingestion.id,
        expectedRowVersion: ingestion.rowVersion,
        orderIds: decision.orderIds,
        shipmentId: shipmentRowId,
        documentId,
      });
      report.applied += 1;
    } catch (error) {
      report.failed += 1;
      deps.onError?.(candidate.shipmentId, error);
      return;
    }
    // Applied — now on the order's label list. A failure here heals on the
    // next run (APPLIED + not listed → recorded).
    try {
      await deps.recordListedLabel(listedInput(candidate, decision.orderIds[0]!, 'outbound', ingestion.id));
      report.listed += 1;
    } catch (error) {
      report.failed += 1;
      deps.onError?.(candidate.shipmentId, error);
    }
  };

  for (const candidate of candidates) {
    if (purchased.has(candidate.labelId)) {
      report.purchasedInApp += 1;
      continue;
    }
    const decision = decideShipStationLabel(
      candidate,
      candidate.orderNumber ? rowsByNumber.get(candidate.orderNumber) ?? [] : [],
    );
    const evidence = shipStationLabelEvidence(candidate);
    const existing = ledgerByShipment.get(candidate.shipmentId);

    if (existing) {
      bump(report.alreadyIngested, existing.state);
      const sameIdentity =
        decision.kind === 'MATCHED' &&
        existing.accountSource === decision.exactOrder.accountSource &&
        existing.marketplaceOrderId === decision.exactOrder.marketplaceOrderId;
      if (existing.state === 'MATCHED' && decision.kind === 'MATCHED' && sameIdentity) {
        await finish(candidate, decision, existing, null);
      } else if (existing.state === 'APPLIED') {
        // Applied before the order-label list existed (or its listing failed): list it.
        if (listed.has(candidate.labelId) || existing.matchedOrderId == null) continue;
        report.listed += 1;
        if (!input.apply) continue;
        try {
          await deps.recordListedLabel(listedInput(candidate, existing.matchedOrderId, 'outbound', existing.id));
        } catch (error) {
          report.listed -= 1;
          report.failed += 1;
          deps.onError?.(candidate.shipmentId, error);
        }
      } else if (existing.state === 'QUARANTINED') {
        if (decision.kind !== 'MATCHED') {
          bump(report.unresolved, decision.reason);
          continue;
        }
        report.promoted += 1;
        if (!input.apply) {
          await finish(candidate, decision, null, null);
          continue;
        }
        try {
          const promoted = await deps.promoteQuarantined(existing, evidence, decision.exactOrder);
          if (promoted) await finish(candidate, decision, promoted, null);
        } catch (error) {
          report.failed += 1;
          deps.onError?.(candidate.shipmentId, error);
        }
      } else if (existing.state === 'MATCHED') {
        // The order it matched no longer resolves to the same exact order — leave it for a human.
        report.failed += 1;
        deps.onError?.(candidate.shipmentId, new Error('MATCHED ledger row no longer resolves to one order'));
      }
      continue;
    }

    let fetched: FetchedLabelPdf;
    try {
      fetched = await fetchShipStationLabelPdf(deps, candidate.labelId);
    } catch (error) {
      bump(report.pdfUnavailable, 'DOWNLOAD_FAILED');
      deps.onError?.(candidate.shipmentId, error);
      continue;
    }
    if (!fetched.ok) {
      bump(report.pdfUnavailable, fetched.problem);
      continue;
    }
    report.pdfFetchable += 1;

    if (!input.apply) {
      report.ingested += 1;
      if (decision.kind === 'MATCHED') await finish(candidate, decision, null, fetched.bytes);
      else bump(report.unresolved, decision.reason);
      continue;
    }

    let recorded: ShipStationIngestionRecord;
    try {
      recorded = await deps.recordIngestion({
        shipmentId: candidate.shipmentId,
        labelId: candidate.labelId,
        observedAt: deps.now().toISOString(),
        fileBasename: `shipstation-${candidate.labelId}.pdf`,
        bytes: fetched.bytes,
        evidence,
        exactOrder: decision.kind === 'MATCHED' ? decision.exactOrder : null,
        quarantineReason: decision.kind === 'MATCHED' ? null : decision.reason,
      });
    } catch (error) {
      report.failed += 1;
      deps.onError?.(candidate.shipmentId, error);
      continue;
    }
    if (recorded.outcome === 'DUPLICATE_PDF') {
      report.duplicatePdf += 1;
      continue;
    }
    if (recorded.outcome === 'CREATED') report.ingested += 1;
    else bump(report.alreadyIngested, recorded.ingestion.state);
    if (decision.kind !== 'MATCHED') {
      bump(report.unresolved, decision.reason);
      continue;
    }
    if (recorded.ingestion.state === 'MATCHED') await finish(candidate, decision, recorded.ingestion, fetched.bytes);
  }

  // Return labels: onto the order's label list under the same order-number
  // rule, never its tracking. Known labels (imported, paired, or unlinked by
  // an operator) are left exactly as they are.
  for (const ret of returnLabels) {
    if (listed.has(ret.labelId) || purchased.has(ret.labelId)) {
      report.returnsKnown += 1;
      continue;
    }
    const decision = decideShipStationLabel(
      { ...ret, primary: true, trackingNumberRaw: ret.trackingNumberRaw ?? '', trackingNumberNormalized: '' },
      ret.orderNumber ? rowsByNumber.get(ret.orderNumber) ?? [] : [],
    );
    if (decision.kind !== 'MATCHED') {
      bump(report.returnsUnresolved, decision.reason);
      continue;
    }
    report.returnsListed += 1;
    if (!input.apply) continue;
    try {
      await deps.recordListedLabel(listedInput(ret, decision.orderIds[0]!, 'return', null));
    } catch (error) {
      report.returnsListed -= 1;
      report.failed += 1;
      deps.onError?.(ret.shipmentId, error);
    }
  }
  return report;
}
