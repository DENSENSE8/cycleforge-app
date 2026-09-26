/**
 * Staff-ID silent print bridge — phone publishes a job; ONE named print station (a computer signed in as that staff ID) prints it on its…
 * operator 2026-09-24 "you should be able to pick one named print station."
 */

import type { LocationSegments } from '@/lib/barcode-routing';
import {
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

export type StaffPrintGrain = 'rack' | 'bin' | 'papers' | 'tote' | 'repair' | 'fnsku';
export type StaffPrintRole = 'label' | 'paper';

export type StaffPrintLocationPayload = {
  roomName: string;
  gln: string;
  orgSlug?: string | null;
  segments: LocationSegments[];
};

export type StaffPrintPapersPayload = {
  orderRowId: number;
  packerLogId: number | null;
  reprint?: boolean;
};

/**
 * Bulk tote run. Mint jobs send a COUNT (never minted ids). Reprint jobs send
 * the typed tote code; the desk looks it up and prints more plates of that
 * identity. Copies is the sticker repeat of that identity — no × sides.
 */
export type StaffPrintTotePayload = {
  count?: number;
  copiesPerSide: number;
  /** Existing tote `H-{id}` / numeric id / external code — reprint, no mint. */
  code?: string;
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

/** Amazon FBA unit labels (Code 128 FNSKU · title · condition) on the station's label printer. */
export type StaffPrintFnskuPayload = { fnsku: string; copies: number };

/** A catalog key the station may look up: A-Z/0-9, as `fba_fnskus.fnsku` stores it. */
const FNSKU_WIRE_RE = /^[A-Z0-9]{1,40}$/;

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

export type StaffPrintProgress = {
  type: 'staff.print_progress';
  request_id: string;
  done: number;
  total: number;
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
    grain !== 'rack' &&
    grain !== 'bin' &&
    grain !== 'papers' &&
    grain !== 'tote' &&
    grain !== 'repair' &&
    grain !== 'fnsku'
  ) {
    return null;
  }
  const role = rec.role === 'paper' ? 'paper' : 'label';

  if (grain === 'fnsku') {
    const payload = rec.fnsku;
    if (!payload || typeof payload !== 'object') return null;
    const p = payload as Record<string, unknown>;
    const fnsku = String(p.fnsku ?? '').trim().toUpperCase();
    if (!FNSKU_WIRE_RE.test(fnsku)) return null;
    // Clamped, not refused: an absent or junk count from an older phone is one sticker.
    const copies = clampLabelCopies(asInt(p.copies));
    return { type: 'staff.print_job', request_id: requestId, targetStationId, grain, role: 'label', fnsku: { fnsku, copies } };
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
    const code = String(t.code ?? '').trim();
    if (code) {
      return {
        type: 'staff.print_job',
        request_id: requestId,
        targetStationId,
        grain,
        role: 'label',
        tote: { copiesPerSide, code },
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
    const orderRowId = asInt(p.orderRowId);
    if (orderRowId == null || orderRowId <= 0) return null;
    const packerLogId = p.packerLogId == null ? null : asInt(p.packerLogId);
    return {
      type: 'staff.print_job',
      request_id: requestId,
      targetStationId,
      grain,
      role: 'paper',
      papers: {
        orderRowId,
        packerLogId,
        reprint: p.reprint === true,
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
  const paper = job.grain === 'papers' || (job.grain === 'repair' && job.role === 'paper');
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
