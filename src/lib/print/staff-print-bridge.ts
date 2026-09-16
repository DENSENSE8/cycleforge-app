/**
 * Staff-ID silent print bridge — phone publishes a job; the computer logged
 * in as that staff ID prints on the paired USB/serial profile.
 *
 * Port of the packer/phone handshake grammar (subscribe-before-publish ACK),
 * not a Pack clone. Channel: {@link getStaffPrintBridgeChannelName}.
 *
 * Callers: StaffPrintBridgeHost (desktop), mobile /m/print. No DB schema —
 * Ably is ephemeral (same D3 as send-to-device). User: staff ID ↔ silent USB.
 */

import type { LocationSegments } from '@/lib/barcode-routing';
import {
  MAX_TOTE_PRINT_RUN,
  clampCopiesPerSide,
  DEFAULT_TOTE_COPIES_PER_SIDE,
} from '@/lib/print/labelCopies';

export const STAFF_PRINT_JOB_EVENT = 'staff_print_job';
export const STAFF_PRINT_STATUS_EVENT = 'staff_print_status';
export const STAFF_PRINT_STATUS_REQUEST_EVENT = 'staff_print_status_request';
export const STAFF_PRINT_PROGRESS_EVENT = 'staff_print_progress';
export const STAFF_PRINT_OPTIONS_PATCH_EVENT = 'staff_print_options_patch';

export type StaffPrintGrain = 'rack' | 'bin' | 'papers' | 'tote';
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

// The tote run's ceiling lives in `labelCopies` (dependency-free print
// constants) because the server's zod schema must read the same number
// without importing this wire module.

export type StaffPrintJob = {
  type: 'staff.print_job';
  request_id: string;
  grain: StaffPrintGrain;
  role: StaffPrintRole;
  location?: StaffPrintLocationPayload;
  papers?: StaffPrintPapersPayload;
  tote?: StaffPrintTotePayload;
};

export type StaffPrintProfileSnap = {
  id: string;
  name: string;
  role: string;
  kind: string;
};

export type StaffPrintStatus = {
  type: 'staff.print_status';
  silent: boolean;
  label: { ready: boolean; name: string | null; kind: string | null; profileId: string | null };
  paper: { ready: boolean; name: string | null; kind: string | null; profileId: string | null };
  profiles: StaffPrintProfileSnap[];
};

export type StaffPrintOptionsPatch = {
  type: 'staff.print_options_patch';
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
  const grain = rec.grain;
  if (grain !== 'rack' && grain !== 'bin' && grain !== 'papers' && grain !== 'tote') return null;
  const role = rec.role === 'paper' ? 'paper' : 'label';

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
    silent: rec.silent !== false,
    label,
    paper,
    profiles,
  };
}

export function parseStaffPrintOptionsPatch(raw: unknown): StaffPrintOptionsPatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const patch: StaffPrintOptionsPatch = { type: 'staff.print_options_patch' };
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
 * Whether THIS workstation should ack + silent-print a job.
 * Phone with no USB profile must return false so the staff-ID computer acks.
 */
export function thisDeviceCanFulfillPrintJob(
  job: Pick<StaffPrintJob, 'grain'>,
  status: StaffPrintStatus,
): boolean {
  return job.grain === 'papers' ? status.paper.ready : status.label.ready;
}
