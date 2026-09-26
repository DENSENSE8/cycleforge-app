/** People-lens coverage assembly (Operations Studio ST6 / Phase E1). */

import { asStation, type StationKey } from '@/lib/neon/staff-stations-queries';

/**
 * operations-catalog department key (node.config.station) → staff_stations enum.
 * A null value means "no floor staff station maps to this department" (ADMIN).
 * Keys are the catalog STATIONS.key values; see the module header for rationale.
 */
export const DEPARTMENT_TO_STAFF_STATION: Record<string, StationKey | null> = {
  RECEIVING: 'UNBOX',
  TECH: 'TECH',
  PACK: 'PACK',
  LABELS: 'PACK',
  FBA: 'FBA',
  ADMIN: null,
};

/**
 * Resolve a node's department key (node.config.station) to the staff_stations
 * enum value whose assigned staff cover it, or null when the department has no
 * floor staff station (ADMIN) or the key is unknown/absent.
 */
export function staffStationForNodeDepartment(
  department: string | null | undefined,
): StationKey | null {
  if (!department) return null;
  const key = String(department).toUpperCase();
  if (key in DEPARTMENT_TO_STAFF_STATION) return DEPARTMENT_TO_STAFF_STATION[key];
  // Defensive: if a future department key happens to already be a valid staff
  // station enum (e.g. a renamed catalog), accept it directly rather than gap.
  return asStation(key);
}

/** One node as the assembler sees it — just its id and its department key. */
interface PeopleNodeRef {
  id: string;
  /** node.config.station — the operations-catalog department key (may be absent). */
  station: string | null;
}

/** One staffer scoped to a station (from staff ⋈ staff_stations). */
export interface StaffStationAssignment {
  staffId: number;
  name: string;
  role: string | null;
  /** The staff_stations enum value they are assigned to. */
  station: StationKey;
  isPrimary: boolean;
}

/** Per-node staffing the People lens renders. */
export interface PeopleNodeCoverage {
  /** Staff scoped to this node's station (primary first, then by name). */
  staff: Array<{ id: number; name: string; role: string | null; isPrimary: boolean }>;
  /** staff.length — the count badge / gap signal (0 = uncovered). */
  coverage: number;
  /** The staff_stations enum this node resolved to, or null (uncovered by mapping). */
  station: StationKey | null;
}

export interface StudioPeopleResponse {
  ok: boolean;
  nodes: Record<string, PeopleNodeCoverage>;
  /** Total distinct staff covering at least one node in the graph. */
  totalCovering: number;
  /** Nodes with zero scoped staff — the coverage gaps. */
  uncoveredNodeIds: string[];
  error?: string;
}

interface AssemblePeopleInput {
  nodes: PeopleNodeRef[];
  /** All staff↔station assignments for the org (any station). */
  assignments: StaffStationAssignment[];
}

/** Assemble per-node staffing coverage from the graph's nodes and the org's staff↔station assignments. */
export function assemblePeopleCoverage(input: AssemblePeopleInput): StudioPeopleResponse {
  // staff_stations enum → its assigned staff (primary first, then name).
  const byStation = new Map<StationKey, StaffStationAssignment[]>();
  for (const a of input.assignments) {
    const list = byStation.get(a.station) ?? [];
    list.push(a);
    byStation.set(a.station, list);
  }
  for (const list of byStation.values()) {
    list.sort((x, y) => {
      if (x.isPrimary !== y.isPrimary) return x.isPrimary ? -1 : 1;
      return x.name.localeCompare(y.name);
    });
  }

  const nodes: Record<string, PeopleNodeCoverage> = {};
  const uncoveredNodeIds: string[] = [];
  const coveringIds = new Set<number>();

  for (const n of input.nodes) {
    const station = staffStationForNodeDepartment(n.station);
    const assigned = station ? byStation.get(station) ?? [] : [];
    const staff = assigned.map((a) => ({
      id: a.staffId,
      name: a.name,
      role: a.role,
      isPrimary: a.isPrimary,
    }));
    nodes[n.id] = { staff, coverage: staff.length, station };
    if (staff.length === 0) uncoveredNodeIds.push(n.id);
    else for (const a of assigned) coveringIds.add(a.staffId);
  }

  return {
    ok: true,
    nodes,
    totalCovering: coveringIds.size,
    uncoveredNodeIds,
  };
}
