import { locationCode, parseLocationCodeFlat } from '@/lib/barcode-routing';

export interface LocationDeleteScope {
  locationIds?: number[];
  room?: string | null;
  zone?: string | null;
  aisle?: number | null;
  bay?: number | null;
  level?: number | null;
  position?: number | null;
}

export interface LocationHierarchy {
  zone: string | null;
  aisle: number | null;
  bay: number | null;
  level: number | null;
  position: number | null;
}

export interface LocationDeleteRowLike {
  id: number;
  name?: string | null;
  barcode: string | null;
  room: string | null;
  row_label: string | null;
  col_label: string | null;
}

function finiteSegment(value: string | undefined): number | null {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Resolve the warehouse hierarchy from the canonical barcode, with row/col as a legacy fallback. */
export function locationHierarchy(row: LocationDeleteRowLike): LocationHierarchy {
  const parsed = row.barcode ? parseLocationCodeFlat(row.barcode) : null;
  if (parsed) {
    return {
      zone: String(parsed.zone),
      aisle: Number(parsed.aisle),
      bay: Number(parsed.bay),
      level: Number(parsed.level),
      position: Number(parsed.position),
    };
  }
  const rowParts = row.row_label?.split('-') ?? [];
  const colParts = row.col_label?.split('-') ?? [];
  return {
    zone: null,
    aisle: finiteSegment(rowParts[0]),
    bay: finiteSegment(rowParts[1]),
    level: finiteSegment(colParts[0]),
    position: finiteSegment(colParts[1]),
  };
}

export function locationMatchesDeleteScope(
  row: LocationDeleteRowLike,
  scope: LocationDeleteScope,
): boolean {
  if (scope.locationIds?.length) return scope.locationIds.includes(Number(row.id));
  if (scope.room?.trim() && row.room !== scope.room.trim() && row.name?.trim() !== scope.room.trim()) return false;
  const hierarchy = locationHierarchy(row);
  if (scope.zone?.trim() && hierarchy.zone !== scope.zone.trim().toUpperCase()) return false;
  for (const key of ['aisle', 'bay', 'level', 'position'] as const) {
    if (scope[key] != null && hierarchy[key] !== scope[key]) return false;
  }
  return true;
}

/** Exact operator-facing address; position 00 is deliberately identified as rack-level. */
export function locationDeleteFace(row: LocationDeleteRowLike): string {
  const hierarchy = locationHierarchy(row);
  if (
    hierarchy.zone && hierarchy.aisle != null && hierarchy.bay != null
    && hierarchy.level != null && hierarchy.position != null
  ) {
    const code = locationCode({
      zone: hierarchy.zone,
      aisle: hierarchy.aisle,
      bay: hierarchy.bay,
      level: hierarchy.level,
      position: hierarchy.position,
    });
    return hierarchy.position === 0 ? `${code.slice(0, -3)} · rack level` : code;
  }
  return row.barcode?.trim() || row.name?.trim() || `Location ${row.id}`;
}

export function hasLocationDeleteScope(scope: LocationDeleteScope): boolean {
  return Boolean(
    scope.locationIds?.length
    || scope.room?.trim()
    || scope.zone?.trim()
    || scope.aisle != null
    || scope.bay != null
    || scope.level != null
    || scope.position != null,
  );
}
