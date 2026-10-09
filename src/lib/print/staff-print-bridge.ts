/**
 * Staff-ID silent print bridge — phone publishes a job; ONE named print station (a computer signed in as that staff ID) prints it on its…
 * operator 2026-09-24 "you should be able to pick one named print station."
 */

import type { LocationSegments } from '@/lib/barcode-routing';
import { qcLabelUsesInternalSerial } from '@/lib/labels/qc-label-row';
import {
  MAX_PAPERWORK_PRINT_ORDERS,
  MAX_TOTE_PRINT_RUN,
  clampCopiesPerSide,
  clampLabelCopies,
  DEFAULT_TOTE_COPIES_PER_SIDE,
} from '@/lib/print/labelCopies';

export const STAFF_PRINT_JOB_EVENT = 'staff_print_job';
export const STAFF_PRINT_STATUS_EVENT = 'staff_print_status';
export const STAFF_PRINT_STATUS_REQUEST_EVENT = 'staff_print_status_request';
export const STAFF_PRINT_PROGRESS_EVENT = 'staff_print_progress';
export const STAFF_PRINT_OPTIONS_PATCH_EVENT = 'staff_print_options_patch';
/** Sender → station: pause, resume or cancel a job it sent, by request id. */
export const STAFF_PRINT_CONTROL_EVENT = 'staff_print_control';

export type StaffPrintGrain = 'bin' | 'papers' | 'tote' | 'repair' | 'fnsku' | 'documents' | 'qc_label' | 'stock_label';
export type StaffPrintRole = 'label' | 'paper';

export type StaffPrintLocationPayload = {
  roomName: string;
  gln: string;
  orgSlug?: string | null;
  segments: LocationSegments[];
};

/** Which order papers a `papers` job prints — the ledger's document types. */
export type StaffPrintPaperDocument = 'shipping_label' | 'packing_slip' | 'manual';

/**
 * Order paperwork on the station's paper printer. One job may carry several
 * orders (a bulk print from chat); the station prints them in order and
 * reports progress per order.
 */
export type StaffPrintPapersPayload = {
  orderRowIds: number[];
  /** The pack this print belongs to — only meaningful for a one-order job. */
  packerLogId: number | null;
  reprint?: boolean;
  /** Only these papers; absent = the whole bundle (label + slip + manuals). */
  documents?: StaffPrintPaperDocument[];
  /** The sender's print batch — keys the ledger rows so the sender can read them back. */
  batchId?: string;
};

const PAPER_DOCUMENTS: Record<string, true> = { shipping_label: true, packing_slip: true, manual: true };
const BATCH_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

/**
 * Bulk tote run. Mint jobs send a COUNT (never minted ids). Reprint jobs send
 * the existing tote codes; the desk prints more plates of those identities.
 * Copies is the sticker repeat of each identity — no × sides.
 */
export type StaffPrintTotePayload = {
  count?: number;
  copiesPerSide: number;
  /** Existing totes — `H-{id}` / numeric id / external code each; reprint, no mint. */
  codes?: string[];
};

/** Which repair document a `repair` job prints — the role follows from it. */
export type StaffPrintRepairDocument = 'receipt' | 'label' | 'manual';

/** One repair document on the station's printer. */
export type StaffPrintRepairPayload = {
  repairId: number;
  document: StaffPrintRepairDocument;
  /** Required for `manual`, absent otherwise. */
  manualId?: number;
};

export function repairDocumentRole(document: StaffPrintRepairDocument): StaffPrintRole {
  return document === 'label' ? 'label' : 'paper';
}

/**
 * Amazon FBA unit labels (Code 128 FNSKU · title · condition) on the station's label printer.
 * `test`: a test print — the same face; no reprint is logged.
 */
export type StaffPrintFnskuPayload = { fnsku: string; copies: number; test?: true };

/** A catalog key the station may look up: A-Z/0-9, as `fba_fnskus.fnsku` stores it. */
const FNSKU_WIRE_RE = /^[A-Z0-9]{1,40}$/;

/**
 * One unit's QC / pre-box sticker on the station's label printer, named by the
 * key its label carries (`unit_uid`, else the serial) — never a bare row id: the
 * station resolves it under its own session (`/api/inventory/qc-labels/unit`).
 */
export type StaffPrintQcLabelPayload = { unitKey: string };

/** A unit key as `serial_units.unit_uid` / `serial_number` store it — no URL, no path, no whitespace. */
const QC_UNIT_KEY_WIRE_RE = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * The key a `qc_label` job names a label by: its package uid when the label
 * names a package, else the unit's minted `unit_uid`, else its OEM serial, else
 * the `U-{serial_unit_id}` handle of a unit with no OEM serial — or null when
 * none can ride the wire (the sender says so instead of sending a job every
 * station would drop).
 */
export function qcLabelWireKey(unit: {
  unit_uid: string | null;
  serial_number: string | null;
  serial_unit_id?: number;
  package?: { uid: string } | null;
}): string | null {
  const serial = qcLabelUsesInternalSerial(unit.serial_number) ? null : unit.serial_number?.trim() || null;
  const handle = !serial && unit.serial_unit_id != null ? `U-${unit.serial_unit_id}` : null;
  for (const raw of [unit.package?.uid, unit.unit_uid, serial, handle]) {
    const key = (raw ?? '').trim();
    if (QC_UNIT_KEY_WIRE_RE.test(key)) return key;
  }
  return null;
}

/**
 * One 4×6 product label off Inventory › Stock (`grain: 'stock_label'`): the
 * record's Print label, or one per selected card from the list's selection
 * bar. The station draws each face itself: the words ride as plain text, the
 * photo as one same-origin photo / item-image path — never a URL to another
 * host.
 */
export type StaffPrintStockLabelFace = {
  sku: string;
  title: string;
  /** The operator's free text, line breaks kept; '' prints blank write-in lines under Notes. */
  notes: string;
  /** `/api/photos/<id>/content` or `/api/zoho/items/<id>/image`, or null for no photo. */
  image: string | null;
  /** A `TMP-` placeholder (on hold): its SKU is not printed — it cannot be sold by that name. */
  onHold: boolean;
};

/** A run of stock labels for one station: one page each, in order. */
export type StaffPrintStockLabelPayload = { labels: StaffPrintStockLabelFace[] };

/** Longest notes a stock label carries — about what fits under the photo on 4×6. */
export const STOCK_LABEL_NOTES_MAX = 400;
/** Most labels one station job carries — kept well under one Ably message (a sender splits a bigger run). */
export const STOCK_LABELS_PER_JOB = 100;
const STOCK_LABEL_SKU_MAX = 100;
const STOCK_LABEL_TITLE_MAX = 300;
const STOCK_LABEL_IMAGE_PATH_RE = /^\/api\/(?:photos\/\d+\/content|zoho\/items\/[A-Za-z0-9._-]+\/image)$/;

/** Whether a stock label may name this image: a same-origin photo or item image, full size. */
export function isStockLabelImagePath(path: string): boolean {
  return STOCK_LABEL_IMAGE_PATH_RE.test(path);
}

/** Wire text: control characters dropped, one line (or line breaks kept), trimmed and capped. */
function wireText(raw: unknown, max: number, multiline = false): string {
  const text = typeof raw === 'string' ? raw : '';
  const clean = multiline
    ? text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
    : text.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ');
  return clean.trim().slice(0, max);
}

/** One stock label face off the wire, or null when its SKU or image is junk. */
function parseStockLabelFace(raw: unknown): StaffPrintStockLabelFace | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const sku = wireText(rec.sku, STOCK_LABEL_SKU_MAX);
  if (!sku) return null;
  const image = rec.image == null ? null : wireText(rec.image, 200);
  if (image != null && !isStockLabelImagePath(image)) return null;
  return {
    sku,
    title: wireText(rec.title, STOCK_LABEL_TITLE_MAX) || sku,
    notes: wireText(rec.notes, STOCK_LABEL_NOTES_MAX, true),
    image,
    onHold: rec.onHold === true,
  };
}

/** A run of 1–{@link STOCK_LABELS_PER_JOB} faces, or null when the list or any face is junk. */
function parseStockLabelPayload(raw: unknown): StaffPrintStockLabelPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const list = (raw as Record<string, unknown>).labels;
  if (!Array.isArray(list) || list.length === 0 || list.length > STOCK_LABELS_PER_JOB) return null;
  const labels: StaffPrintStockLabelFace[] = [];
  for (const row of list) {
    const face = parseStockLabelFace(row);
    if (!face) return null;
    labels.push(face);
  }
  return { labels };
}

/**
 * One desk document a station prints, by id only: the station rebuilds its
 * same-origin bytes URL from the id and never trusts a sender's URL.
 * Label → `ingestionId` (ledger label) or `documentId` (a shipping-label
 * document with no ingestion), packing slip → `documentId`, manual → `manualId`.
 */
export type StationDocumentRef = {
  kind: 'label' | 'packing_slip' | 'manual';
  orderId: number | null;
  title: string;
  ingestionId?: number;
  documentId?: number;
  manualId?: number;
};

/** A Labels & docs press sent to a named station: one stock, one batch. */
export type StaffPrintDocumentsPayload = {
  stock: StaffPrintRole;
  batchId: string;
  items: StationDocumentRef[];
};

/** Most documents one station job carries — well under one Ably message. */
export const MAX_STATION_DOCUMENTS = 200;
const STATION_DOCUMENT_TITLE_MAX = 200;

// The tote run's ceiling lives in `labelCopies` (dependency-free print
// constants) because the server's zod schema must read the same number
// without importing this wire module.

export type StaffPrintJob = {
  type: 'staff.print_job';
  request_id: string;
  /** The one station that prints it; every other host ignores the job. */
  targetStationId: string;
  grain: StaffPrintGrain;
  role: StaffPrintRole;
  location?: StaffPrintLocationPayload;
  papers?: StaffPrintPapersPayload;
  tote?: StaffPrintTotePayload;
  repair?: StaffPrintRepairPayload;
  fnsku?: StaffPrintFnskuPayload;
  qcLabel?: StaffPrintQcLabelPayload;
  stockLabel?: StaffPrintStockLabelPayload;
  documents?: StaffPrintDocumentsPayload;
};

/**
 * What a sender chooses; the bridge client stamps `type`, the minted
 * `request_id` and the picked station's `targetStationId`.
 */
export type StaffPrintJobBody = Omit<StaffPrintJob, 'type' | 'request_id' | 'targetStationId'>;

export type StaffPrintProfileSnap = {
  id: string;
  name: string;
  role: string;
  kind: string;
};

export type StaffPrintStatus = {
  type: 'staff.print_status';
  /** Stable per-browser station id (see `@/lib/print/print-station`). */
  stationId: string;
  /** Human name the operator gave this computer. */
  stationName: string;
  silent: boolean;
  label: { ready: boolean; name: string | null; kind: string | null; profileId: string | null };
  paper: { ready: boolean; name: string | null; kind: string | null; profileId: string | null };
  profiles: StaffPrintProfileSnap[];
};

export type StaffPrintOptionsPatch = {
  type: 'staff.print_options_patch';
  /** The one station whose silent flag / routing this changes. */
  targetStationId: string;
  silent?: boolean;
  routing?: { label?: string | null; paper?: string | null };
};

/** Where a station's job stands, as its progress ticks report it. */
export type StaffPrintJobState = 'running' | 'paused' | 'done' | 'failed' | 'cancelled';

export type StaffPrintProgress = {
  type: 'staff.print_progress';
  request_id: string;
  done: number;
  total: number;
  /** Absent from a plain tick (and from older stations): still running. */
  state?: StaffPrintJobState;
  /** The outcome in words, with a terminal state. */
  message?: string;
};

export type StaffPrintControlAction = 'pause' | 'resume' | 'cancel';

export type StaffPrintControl = {
  type: 'staff.print_control';
  request_id: string;
  /** The station printing it; every other host ignores the control. */
  targetStationId: string;
  action: StaffPrintControlAction;
};

function asInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function parseSegments(raw: unknown): LocationSegments[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: LocationSegments[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') return null;
    const rec = row as Record<string, unknown>;
    const zone = String(rec.zone ?? '')
      .trim()
      .toUpperCase()
      .charAt(0);
    const aisle = asInt(rec.aisle);
    const bay = asInt(rec.bay);
    const level = asInt(rec.level);
    const position = asInt(rec.position);
    if (!/^[A-Z]$/.test(zone) || aisle == null || bay == null || level == null || position == null) {
      return null;
    }
    out.push({ zone, aisle, bay, level, position });
  }
  return out;
}

function positiveId(value: unknown): number | null {
  const n = asInt(value);
  return n != null && Number.isInteger(n) && n > 0 ? n : null;
}

/** One station document ref, or null when its kind, id or title is junk. */
function parseStationDocumentRef(raw: unknown, stock: StaffPrintRole): StationDocumentRef | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const kind = rec.kind;
  if (kind !== 'label' && kind !== 'packing_slip' && kind !== 'manual') return null;
  // One job is one stock: a label never rides a paper job, nor a slip a label job.
  if ((kind === 'label') !== (stock === 'label')) return null;
  const title = typeof rec.title === 'string' ? rec.title.trim().slice(0, STATION_DOCUMENT_TITLE_MAX) : '';
  if (!title) return null;
  let orderId: number | null = null;
  if (rec.orderId != null) {
    orderId = positiveId(rec.orderId);
    if (orderId == null) return null;
  }
  if (kind === 'label') {
    // A ledger label prints by its ingestion (any other id is dropped); a label document with no ingestion by its document.
    if (rec.ingestionId != null) {
      const ingestionId = positiveId(rec.ingestionId);
      return ingestionId == null ? null : { kind, orderId, title, ingestionId };
    }
    const documentId = positiveId(rec.documentId);
    return documentId == null ? null : { kind, orderId, title, documentId };
  }
  if (kind === 'packing_slip') {
    const documentId = positiveId(rec.documentId);
    return documentId == null ? null : { kind, orderId, title, documentId };
  }
  const manualId = positiveId(rec.manualId);
  return manualId == null ? null : { kind, orderId, title, manualId };
}

function parseStationDocuments(raw: unknown): StaffPrintDocumentsPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const stock = rec.stock;
  if (stock !== 'label' && stock !== 'paper') return null;
  if (typeof rec.batchId !== 'string' || !BATCH_ID_RE.test(rec.batchId)) return null;
  if (!Array.isArray(rec.items) || rec.items.length === 0 || rec.items.length > MAX_STATION_DOCUMENTS) return null;
  const items: StationDocumentRef[] = [];
  const seen = new Set<string>();
  for (const row of rec.items) {
    const item = parseStationDocumentRef(row, stock);
    if (!item) return null;
    const key = item.ingestionId != null ? `ingestion:${item.ingestionId}` : `${item.kind}:${item.documentId ?? item.manualId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return { stock, batchId: rec.batchId, items };
}

/** Returns a typed job or null — never throws on junk wire data. */
export function parseStaffPrintJob(raw: unknown): StaffPrintJob | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const requestId = String(rec.request_id ?? '').trim();
  if (!requestId) return null;
  // No target, no job: an untargeted job would print on every computer signed
  // in as the staffer.
  const targetStationId = String(rec.targetStationId ?? '').trim();
  if (!targetStationId) return null;
  const grain = rec.grain;
  if (
    grain !== 'bin' &&
    grain !== 'papers' &&
    grain !== 'tote' &&
    grain !== 'repair' &&
    grain !== 'fnsku' &&
    grain !== 'documents' &&
    grain !== 'qc_label' &&
    grain !== 'stock_label'
  ) {
    return null;
  }
  const role = rec.role === 'paper' ? 'paper' : 'label';

  if (grain === 'documents') {
    const documents = parseStationDocuments(rec.documents);
    if (!documents) return null;
    return { type: 'staff.print_job', request_id: requestId, targetStationId, grain, role: documents.stock, documents };
  }

  if (grain === 'fnsku') {
    const payload = rec.fnsku;
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as Record<string, unknown>;
    const fnsku = String(p.fnsku ?? '').trim().toUpperCase();
    if (!FNSKU_WIRE_RE.test(fnsku)) return null;
    // Clamped, not refused: an absent or junk count from an older phone is one sticker.
    const copies = clampLabelCopies(asInt(p.copies));
    const fnskuPayload: StaffPrintFnskuPayload = p.test === true ? { fnsku, copies, test: true } : { fnsku, copies };
    return { type: 'staff.print_job', request_id: requestId, targetStationId, grain, role: 'label', fnsku: fnskuPayload };
  }

  if (grain === 'qc_label') {
    const payload = rec.qcLabel;
    if (!payload || typeof payload !== 'object') return null;
    const unitKey = String((payload as Record<string, unknown>).unitKey ?? '').trim();
    if (!QC_UNIT_KEY_WIRE_RE.test(unitKey)) return null;
    return { type: 'staff.print_job', request_id: requestId, targetStationId, grain, role: 'label', qcLabel: { unitKey } };
  }

  if (grain === 'stock_label') {
    const stockLabel = parseStockLabelPayload(rec.stockLabel);
    if (!stockLabel) return null;
    return { type: 'staff.print_job', request_id: requestId, targetStationId, grain, role: 'label', stockLabel };
  }

  if (grain === 'repair') {
    const repair = rec.repair;
    if (!repair || typeof repair !== 'object') return null;
    const r = repair as Record<string, unknown>;
    const repairId = asInt(r.repairId);
    if (repairId == null || !Number.isInteger(repairId) || repairId <= 0) return null;
    const document = r.document;
    if (document !== 'receipt' && document !== 'label' && document !== 'manual') return null;
    let manualId: number | undefined;
    if (document === 'manual') {
      const id = asInt(r.manualId);
      if (id == null || !Number.isInteger(id) || id <= 0) return null;
      manualId = id;
    }
    return {
      type: 'staff.print_job',
      request_id: requestId,
      targetStationId,
      grain,
      role: repairDocumentRole(document),
      repair: manualId == null ? { repairId, document } : { repairId, document, manualId },
    };
  }

  if (grain === 'tote') {
    const tote = rec.tote;
    if (!tote || typeof tote !== 'object') return null;
    const t = tote as Record<string, unknown>;
    const copiesPerSide = clampCopiesPerSide(
      asInt(t.copiesPerSide) ?? DEFAULT_TOTE_COPIES_PER_SIDE,
    );
    const codes = Array.isArray(t.codes)
      ? [...new Set(t.codes.map((c) => String(c ?? '').trim()).filter(Boolean))]
      : [];
    if (codes.length > MAX_TOTE_PRINT_RUN) return null;
    if (codes.length > 0) {
      return {
        type: 'staff.print_job',
        request_id: requestId,
        targetStationId,
        grain,
        role: 'label',
        tote: { copiesPerSide, codes },
      };
    }
    const count = asInt(t.count);
    // Bounded here as well as at the route: an unbounded count off the wire is
    // a printer that never stops and a table that fills with orphan boxes.
    if (count == null || count < 1 || count > MAX_TOTE_PRINT_RUN) return null;
    return {
      type: 'staff.print_job',
      request_id: requestId,
      targetStationId,
      grain,
      role: 'label',
      tote: { count, copiesPerSide },
    };
  }

  if (grain === 'papers') {
    const papers = rec.papers;
    if (!papers || typeof papers !== 'object') return null;
    const p = papers as Record<string, unknown>;
    if (!Array.isArray(p.orderRowIds)) return null;
    const orderRowIds = [...new Set(p.orderRowIds.map((v) => asInt(v) ?? 0))];
    if (orderRowIds.length === 0 || orderRowIds.length > MAX_PAPERWORK_PRINT_ORDERS) return null;
    if (orderRowIds.some((id) => !Number.isInteger(id) || id <= 0)) return null;
    const packerLogId = p.packerLogId == null ? null : asInt(p.packerLogId);
    let documents: StaffPrintPaperDocument[] | undefined;
    if (p.documents != null) {
      if (!Array.isArray(p.documents) || p.documents.length === 0) return null;
      if (!p.documents.every((d) => typeof d === 'string' && Object.hasOwn(PAPER_DOCUMENTS, d))) return null;
      documents = [...new Set(p.documents as StaffPrintPaperDocument[])];
    }
    const batchId = typeof p.batchId === 'string' && BATCH_ID_RE.test(p.batchId) ? p.batchId : undefined;
    return {
      type: 'staff.print_job',
      request_id: requestId,
      targetStationId,
      grain,
      role: 'paper',
      papers: {
        orderRowIds,
        packerLogId: orderRowIds.length === 1 ? packerLogId : null,
        reprint: p.reprint === true,
        ...(documents ? { documents } : {}),
        ...(batchId ? { batchId } : {}),
      },
    };
  }

  const location = rec.location;
  if (!location || typeof location !== 'object') return null;
  const loc = location as Record<string, unknown>;
  const roomName = String(loc.roomName ?? '').trim();
  const gln = String(loc.gln ?? '').trim();
  const segments = parseSegments(loc.segments);
  if (!roomName || !segments) return null;
  return {
    type: 'staff.print_job',
    request_id: requestId,
    targetStationId,
    grain,
    role,
    location: {
      roomName,
      gln,
      orgSlug: loc.orgSlug == null ? null : String(loc.orgSlug),
      segments,
    },
  };
}

function parseRoleFace(raw: unknown): {
  ready: boolean;
  name: string | null;
  kind: string | null;
  profileId: string | null;
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  return {
    ready: rec.ready === true,
    name: rec.name == null ? null : String(rec.name),
    kind: rec.kind == null ? null : String(rec.kind),
    profileId: rec.profileId == null || rec.profileId === '' ? null : String(rec.profileId),
  };
}

export function parseStaffPrintStatus(raw: unknown): StaffPrintStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  // A status with no station id cannot be picked or targeted — junk.
  const stationId = String(rec.stationId ?? '').trim();
  if (!stationId) return null;
  const stationName = String(rec.stationName ?? '').trim() || UNNAMED_PRINT_STATION;
  const label = parseRoleFace(rec.label);
  const paper = parseRoleFace(rec.paper);
  if (!label || !paper) return null;
  const profilesRaw = Array.isArray(rec.profiles) ? rec.profiles : [];
  const profiles: StaffPrintProfileSnap[] = [];
  for (const row of profilesRaw) {
    if (!row || typeof row !== 'object') continue;
    const p = row as Record<string, unknown>;
    const id = String(p.id ?? '').trim();
    if (!id) continue;
    profiles.push({
      id,
      name: String(p.name ?? id),
      role: String(p.role ?? ''),
      kind: String(p.kind ?? ''),
    });
  }
  return {
    type: 'staff.print_status',
    stationId,
    stationName,
    silent: rec.silent !== false,
    label,
    paper,
    profiles,
  };
}

export function parseStaffPrintOptionsPatch(raw: unknown): StaffPrintOptionsPatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const targetStationId = String(rec.targetStationId ?? '').trim();
  if (!targetStationId) return null;
  const patch: StaffPrintOptionsPatch = { type: 'staff.print_options_patch', targetStationId };
  if (typeof rec.silent === 'boolean') patch.silent = rec.silent;
  const routing = rec.routing;
  if (routing && typeof routing === 'object') {
    const r = routing as Record<string, unknown>;
    patch.routing = {};
    if ('label' in r) patch.routing.label = r.label == null ? null : String(r.label);
    if ('paper' in r) patch.routing.paper = r.paper == null ? null : String(r.paper);
  }
  if (patch.silent === undefined && !patch.routing) return null;
  return patch;
}

const JOB_STATES: Record<string, true> = { running: true, paused: true, done: true, failed: true, cancelled: true };

/** A station's progress tick, or null on junk. */
export function parseStaffPrintProgress(raw: unknown): StaffPrintProgress | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const requestId = String(rec.request_id ?? '').trim();
  const done = asInt(rec.done);
  const total = asInt(rec.total);
  if (!requestId || done == null || total == null) return null;
  const state = typeof rec.state === 'string' && Object.hasOwn(JOB_STATES, rec.state) ? (rec.state as StaffPrintJobState) : undefined;
  return {
    type: 'staff.print_progress',
    request_id: requestId,
    done,
    total,
    ...(state ? { state } : {}),
    ...(typeof rec.message === 'string' && rec.message ? { message: rec.message.slice(0, 300) } : {}),
  };
}

export function parseStaffPrintControl(raw: unknown): StaffPrintControl | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const requestId = String(rec.request_id ?? '').trim();
  const targetStationId = String(rec.targetStationId ?? '').trim();
  const action = rec.action;
  if (!requestId || !targetStationId) return null;
  if (action !== 'pause' && action !== 'resume' && action !== 'cancel') return null;
  return { type: 'staff.print_control', request_id: requestId, targetStationId, action };
}

export function roleReady(status: StaffPrintStatus | null, role: StaffPrintRole): boolean {
  if (!status || !status.silent) return false;
  return role === 'paper' ? status.paper.ready : status.label.ready;
}

/**
 * Whether THIS station should ack + silent-print a job: it must be the job's
 * `targetStationId` AND have the job's role ready. Every other computer signed
 * in as the staffer — and the phone's own host — returns false and stays quiet.
 */
export function thisDeviceCanFulfillPrintJob(
  job: Pick<StaffPrintJob, 'grain' | 'targetStationId'> & { role?: StaffPrintRole },
  status: StaffPrintStatus,
): boolean {
  if (job.targetStationId !== status.stationId) return false;
  const paper =
    job.grain === 'papers' || ((job.grain === 'repair' || job.grain === 'documents') && job.role === 'paper');
  return paper ? status.paper.ready : status.label.ready;
}

// ── Station roster (phone side) ────────────────────────────────────────────

/** Name shown for a station whose operator never named it. */
export const UNNAMED_PRINT_STATION = 'Unnamed computer';

/** How often an open picker re-asks every station for its status. */
export const STAFF_PRINT_STATUS_POLL_MS = 15_000;

/** A station unheard for this long is offline (two missed polls + slack). */
export const STAFF_PRINT_STATION_STALE_MS = 40_000;

/** A station the phone has heard from, and when it last answered. */
export type StaffPrintStation = { status: StaffPrintStatus; lastSeenAt: number };

/** Whether a host is a print station at all: */
export function isPrintStation(status: StaffPrintStatus): boolean {
  return status.profiles.length > 0 || status.label.ready || status.paper.ready;
}

/**
 * Fold one status into the roster: replaces that station's entry, sorted by
 * name then id. A status that is no longer a print station drops out.
 */
export function upsertStaffPrintStation(
  stations: readonly StaffPrintStation[],
  status: StaffPrintStatus,
  now: number,
): StaffPrintStation[] {
  const rest = stations.filter((s) => s.status.stationId !== status.stationId);
  if (isPrintStation(status)) rest.push({ status, lastSeenAt: now });
  return rest.sort(
    (a, b) =>
      a.status.stationName.localeCompare(b.status.stationName) ||
      a.status.stationId.localeCompare(b.status.stationId),
  );
}

export function isStaffPrintStationLive(station: StaffPrintStation, now: number): boolean {
  return now - station.lastSeenAt <= STAFF_PRINT_STATION_STALE_MS;
}

/**
 * The station a job goes to: the staffer's remembered pick when it is in the
 * roster (live or not — offline is shown, never silently swapped), else the
 * only live station, else none (the phone must pick).
 */
export function resolveStaffPrintTarget(
  stations: readonly StaffPrintStation[],
  rememberedId: string | null,
  now: number,
): StaffPrintStation | null {
  if (rememberedId) {
    const remembered = stations.find((s) => s.status.stationId === rememberedId);
    if (remembered) return remembered;
  }
  const live = stations.filter((s) => isStaffPrintStationLive(s, now));
  return live.length === 1 ? live[0] : null;
}

/** Why a role cannot print on the chosen station right now; null when it can. */
export function staffPrintBlockedReason(
  station: StaffPrintStation | null,
  role: StaffPrintRole,
  now: number,
): string | null {
  if (!station) return 'Choose a printer.';
  const name = station.status.stationName;
  if (!isStaffPrintStationLive(station, now)) return `${name} is offline.`;
  if (!roleReady(station.status, role)) return `${name} has no ${role} printer set up.`;
  return null;
}

export const NO_PRINT_STATION_ONLINE =
  'No print station online. Keep CycleForge open on the computer with the printer.';

/** What a sender that sends without a tap (the chat print card) does with the roster heard so far. */
export type StaffPrintAutoDecision =
  | { kind: 'send'; station: StaffPrintStation }
  | { kind: 'wait' }
  | { kind: 'pick'; reason: string }
  | { kind: 'fail'; reason: string };

/**
 * The staffer's remembered pick sends the moment it answers ready. With no
 * pick, the only live station sends once `settled` (every station had its
 * chance to answer — an early lone reply is not "the only one"). A remembered
 * pick that never answers is NOT swapped for another computer: the operator
 * picks. Nothing ready anywhere fails.
 */
export function decideStaffPrintAutoSend(input: {
  stations: readonly StaffPrintStation[];
  rememberedId: string | null;
  role: StaffPrintRole;
  now: number;
  settled: boolean;
}): StaffPrintAutoDecision {
  const { stations, rememberedId, role, now, settled } = input;
  const target = resolveStaffPrintTarget(stations, rememberedId, now);
  const blocked = staffPrintBlockedReason(target, role, now);
  const picked = !!target && target.status.stationId === rememberedId;
  if (target && !blocked && (picked || (settled && !rememberedId))) return { kind: 'send', station: target };
  if (!settled) return { kind: 'wait' };
  const live = stations.filter((s) => isStaffPrintStationLive(s, now));
  if (!live.some((s) => roleReady(s.status, role))) {
    return {
      kind: 'fail',
      reason:
        live.length === 0
          ? NO_PRINT_STATION_ONLINE
          : target && blocked
            ? blocked
            : `No computer online has a ${role} printer set up.`,
    };
  }
  if (rememberedId && !picked) return { kind: 'pick', reason: "Your print station isn't answering. Choose a printer." };
  return { kind: 'pick', reason: picked && blocked ? blocked : 'Choose a printer.' };
}
