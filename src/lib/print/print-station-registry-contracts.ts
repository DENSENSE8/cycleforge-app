/**
 * Wire of the org print-station registry (`/api/v1/print-stations`): the
 * heartbeat a station sends, the list anyone reads, and the org's default
 * station per stock. Browser- and server-safe.
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

/** The org's default station id per stock; null = none assigned. */
export type PrintStationAssignment = Record<PrintStock, string | null>;

export interface OrgPrintStation {
  stationId: string;
  name: string;
  label: { ready: boolean; printer: string | null };
  paper: { ready: boolean; printer: string | null };
  /** ISO time of the last heartbeat (server clock). */
  lastSeenAt: string;
  /** Heard within `STAFF_PRINT_STATION_STALE_MS`, judged on the server clock. */
  online: boolean;
  lastSeenStaffId: number | null;
}

export interface PrintStationRegistry {
  stations: OrgPrintStation[];
  assignment: PrintStationAssignment;
}
