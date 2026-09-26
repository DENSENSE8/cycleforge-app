/** Built-in registry + bootstrap SoT for the `station_command` Class-D vocabulary — physical CMD-* stickers that arm session modes on scan… */

export const STATION_COMMAND_FLOW_CONTEXT = 'station_command' as const;

/** Session mode a command arms (or returns to). */
export type StationCommandMode = 'batch_sort' | 'default';

interface StationCommandMeta {
  /** Exact string encoded on the sticker / accepted by the wedge. */
  code: string;
  /** Human label on the Admin catalog + 2×1 face center. */
  label: string;
  /** Mode the Arrival traffic cop maps this command to. */
  mode: StationCommandMode;
  sortOrder: number;
}

export const STATION_COMMAND_CODES: readonly StationCommandMeta[] = [
  {
    code: 'CMD-BATCH-SORT',
    label: 'Batch sort',
    mode: 'batch_sort',
    sortOrder: 10,
  },
  {
    code: 'CMD-DEFAULT',
    label: 'Default lookup',
    mode: 'default',
    sortOrder: 20,
  },
] as const;

const BY_CODE = new Map(
  STATION_COMMAND_CODES.map((c) => [c.code.toUpperCase(), c] as const),
);

/**
 * Parse a raw scan into a station command mode, or null when it is not a
 * registered CMD-* sticker.
 */
export function parseStationCommand(raw: string): StationCommandMode | null {
  const hit = BY_CODE.get(String(raw ?? '').trim().toUpperCase());
  return hit?.mode ?? null;
}

/** Convenience aliases used by Arrival routing + tests. */
export const ARRIVAL_CMD_BATCH_SORT = 'CMD-BATCH-SORT' as const;
export const ARRIVAL_CMD_DEFAULT = 'CMD-DEFAULT' as const;
