/**
 * One PACK scan → its `packer_logs` row and the instant its activity row
 * carries (`POST /api/packing-logs`).
 *
 * A package keeps ONE `packer_logs` row: its `created_at` is the first-pack
 * fact and never moves. Every scan — first or re-scan — writes its own
 * `station_activity_logs` PACK row, and that row is the scan: it is stamped
 * with the scan instant, never the first pack's. (Stamping a re-scan with the
 * old `created_at` sank it below newer packs in the Packing rail and week
 * window, so a re-scanned package never came back to the top.)
 */

import { fromZonedTime } from 'date-fns-tz';
import type { OrgId } from '@/lib/tenancy/constants';
import { WAREHOUSE_TIME_ZONE } from '@/utils/date';
import {
  createPackerLog,
  touchPackerLog,
  type CreatePackerLogInput,
} from './packer-log-writer';

type Queryable = Parameters<typeof createPackerLog>[0];

export interface PackScanLogDeps {
  create: typeof createPackerLog;
  touch: typeof touchPackerLog;
}

const defaultDeps: PackScanLogDeps = { create: createPackerLog, touch: touchPackerLog };

export interface PackScanLogInput {
  organizationId: OrgId;
  /** The package's existing `packer_logs.id` (a re-scan), or null (first pack). */
  existingPackerLogId: number | null;
  /** The scan as a warehouse wall clock `YYYY-MM-DD HH:MM:SS` (`normalizePSTTimestamp`). */
  scanAt: string;
  packedBy: number;
  /** The first-pack row to insert when there is no existing row. */
  create: Pick<CreatePackerLogInput, 'shipmentId' | 'scanRef' | 'trackingType' | 'source'>;
  /** Canonical-event source for the re-scan touch. */
  rescanSource: string;
}

export interface PackScanLog {
  packerLogId: number | null;
  /** UTC ISO instant of THIS scan — the activity row's `created_at`. */
  activityAt: string;
  /** True when the scan reused the package's existing row. */
  rescan: boolean;
}

/** Warehouse wall clock → UTC ISO instant (`station_activity_logs.created_at` is timestamptz). */
export function warehouseWallClockToIso(wallClock: string): string {
  const instant = fromZonedTime(wallClock.trim().replace(' ', 'T'), WAREHOUSE_TIME_ZONE);
  return Number.isNaN(instant.getTime()) ? new Date().toISOString() : instant.toISOString();
}

export async function writePackScanLog(
  db: Queryable,
  input: PackScanLogInput,
  deps: PackScanLogDeps = defaultDeps,
): Promise<PackScanLog> {
  const activityAt = warehouseWallClockToIso(input.scanAt);

  if (input.existingPackerLogId != null) {
    await deps.touch(db, {
      organizationId: input.organizationId,
      packerLogId: input.existingPackerLogId,
      packedBy: input.packedBy,
      source: input.rescanSource,
    });
    return { packerLogId: input.existingPackerLogId, activityAt, rescan: true };
  }

  const created = await deps.create(db, {
    organizationId: input.organizationId,
    ...input.create,
    createdAt: input.scanAt,
    packedBy: input.packedBy,
  });
  return { packerLogId: created?.id ?? null, activityAt, rescan: false };
}
