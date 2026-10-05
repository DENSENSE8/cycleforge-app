/**
 * Wire of the org print-station registry (`/api/v1/print-stations`): the
 * heartbeat a station sends, the list anyone reads, the org's default station
 * per stock, and the control plane (enroll · pause · revoke · job log). Also
 * the enrolled station's own device wire (`/api/print-station-device`).
 * Browser- and server-safe.
 */
import { z } from 'zod';
import type { PrintStock } from '@/lib/label-prints/print-route';

const stockFaceSchema = z.object({
  ready: z.boolean(),
  printer: z.string().trim().min(1).max(120).nullable(),
});

/** POST /api/v1/print-stations — a station says it is alive and what it can print. */
export const printStationHeartbeatBodySchema = z.object({
  stationId: z.string().trim().min(1).max(100),
  stationName: z.string().trim().min(1).max(120),
  label: stockFaceSchema,
  paper: stockFaceSchema,
}).strict();

export type PrintStationHeartbeat = z.infer<typeof printStationHeartbeatBodySchema>;

/**
 * PUT /api/v1/print-stations/name — rename one station for the whole org. The
 * registry owns the name; an empty name resets it to unnamed. Same ceiling as
 * the name a computer keeps locally (`PRINT_STATION_NAME_MAX`).
 */
export const printStationRenameBodySchema = z.object({
  stationId: z.string().trim().min(1).max(100),
  name: z.string().trim().max(40),
}).strict();

export type PrintStationRenameBody = z.infer<typeof printStationRenameBodySchema>;

/** PUT /api/v1/print-stations/assignment — set (or with null, clear) the org's station for one stock. */
export const printStationAssignmentBodySchema = z.object({
  stock: z.enum(['label', 'paper']),
  stationId: z.string().trim().min(1).max(100).nullable(),
}).strict();

export type PrintStationAssignmentBody = z.infer<typeof printStationAssignmentBodySchema>;

/** POST /api/v1/print-stations/enroll — a new org-owned station; its name is required and unique. */
export const printStationEnrollBodySchema = z.object({
  name: z.string().trim().min(1).max(40),
}).strict();

/** POST /api/v1/print-stations/re-pair — replace one enrolled station's device credential in place. */
export const printStationRePairBodySchema = z.object({
  stationId: z.string().trim().min(1).max(100),
}).strict();

/** What enrolling answers: the station, and its single-use pairing code (shown once). */
export interface PrintStationEnrollment {
  stationId: string;
  code: string;
  /** ISO time the code stops pairing. */
  expiresAt: string;
}

/** PUT /api/v1/print-stations/pause — pause (refuse jobs) or resume one station. */
export const printStationPauseBodySchema = z.object({
  stationId: z.string().trim().min(1).max(100),
  paused: z.boolean(),
}).strict();

/** POST /api/v1/print-stations/revoke — revoke an enrolled station (its credential dies) or forget a browser one. */
export const printStationRevokeBodySchema = z.object({
  stationId: z.string().trim().min(1).max(100),
}).strict();

/** GET /api/v1/print-stations/jobs?station= — one station's job log. */
export const printStationJobsQuerySchema = z.object({
  station: z.string().trim().min(1).max(100),
});

/** One print a station logged (`label_print_jobs.station_id`), newest first. */
export interface PrintStationJob {
  id: number;
  /** What the barcode encoded — the FNSKU for an FBA label. */
  payload: string;
  templateId: string | null;
  copies: number;
  /** ISO time it was logged. */
  createdAt: string;
}

/** The org default station per stock; null = none assigned. */
export type PrintStationAssignment = Record<PrintStock, string | null>;

/** `browser`: a staff browser's own station · `enrolled`: an org-owned computer paired with a code. */
export type PrintStationKind = 'browser' | 'enrolled';

export interface OrgPrintStation {
  stationId: string;
  name: string;
  kind: PrintStationKind;
  /** Paused stations refuse jobs until resumed. */
  paused: boolean;
  label: { ready: boolean; printer: string | null };
  paper: { ready: boolean; printer: string | null };
  /** ISO time of the last heartbeat (server clock); null = never heard (an enrolled station not paired yet). */
  lastSeenAt: string | null;
  /** Heard within `STAFF_PRINT_STATION_STALE_MS`, judged on the server clock. */
  online: boolean;
  lastSeenStaffId: number | null;
  /** ISO time of the newest job it logged; null = none. */
  lastJobAt: string | null;
}

export interface PrintStationRegistry {
  stations: OrgPrintStation[];
  assignment: PrintStationAssignment;
}

// ── The enrolled station's own wire (`/api/print-station-device/*`) ─────────

/** The operator-facing station code: four large decimal digits, shown once. */
export const PRINT_STATION_PAIR_CODE_LENGTH = 4;

/** Keep typing and paste behavior identical on the pairing screen. */
export function normalizePrintStationPairCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, PRINT_STATION_PAIR_CODE_LENGTH);
}

/** POST /api/print-station-device/pair — the rate-limited single-use code is the capability. */
export const printStationDevicePairBodySchema = z.object({
  code: z.string().regex(/^\d{4}$/),
}).strict();

/** POST /api/print-station-device/heartbeat — the station is alive and what its label / paper printers can do. */
export const printStationDeviceHeartbeatBodySchema = z.object({
  label: stockFaceSchema,
  paper: stockFaceSchema,
}).strict();

export type PrintStationDeviceHeartbeat = z.infer<typeof printStationDeviceHeartbeatBodySchema>;

/** What the device learns from pairing and from every heartbeat (the org keys its station channel). */
export interface PrintStationDeviceState {
  organizationId: string;
  stationId: string;
  name: string;
  paused: boolean;
}
