import { z } from 'zod';

/** Request schemas for /api/staff-todos (the header goal chip's checklists). */
const StaffTodoStation = z.enum(['TECH', 'PACK', 'UNBOX', 'SALES', 'FBA']);

/**
 * Read-side station selector: a real station, or `ALL` for the every-station
 * triage table. Reads only — a WRITE always names the station list it lands on,
 * so `ALL` never reaches create / rename / toggle.
 */
export const StaffTodoStationQuery = z.union([StaffTodoStation, z.literal('ALL')]);

const MAX_INTERVAL_MS = 7 * 24 * 60 * 60_000; // a week — far beyond the UI's "Daily" cap

export const StaffTodoCreateBody = z.object({
  station: StaffTodoStation,
  kind: z.enum(['general', 'recurring']),
  text: z.string().trim().min(1).max(500),
  /** Only honored for the FIRST recurring task of a station list. */
  intervalMs: z.number().int().positive().max(MAX_INTERVAL_MS).optional(),
  idempotencyKey: z.string().max(200).optional(),
});
export type StaffTodoCreateBody = z.infer<typeof StaffTodoCreateBody>;

export const StaffTodoPatchBody = z.discriminatedUnion('action', [
  // Absolute checked state (not a flip) so retries are safe.
  z.object({
    action: z.literal('toggle'),
    id: z.number().int().positive(),
    done: z.boolean(),
  }),
  // Reset interval for a station's whole recurring list (restarts the cycle).
  z.object({
    action: z.literal('set_interval'),
    station: StaffTodoStation,
    intervalMs: z.number().int().positive().max(MAX_INTERVAL_MS),
  }),
  // Rename a live task (the U in CRUD). Same length bound as create.
  z.object({
    action: z.literal('rename'),
    id: z.number().int().positive(),
    text: z.string().trim().min(1).max(500),
  }),
  // Restore an archived task (reverse of DELETE/archive).
  z.object({
    action: z.literal('unarchive'),
    id: z.number().int().positive(),
  }),
]);
export type StaffTodoPatchBody = z.infer<typeof StaffTodoPatchBody>;
