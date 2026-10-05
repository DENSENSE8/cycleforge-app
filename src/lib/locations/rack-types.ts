/**
 * Movable-rack wire contract — pure, client-safe. `/api/racks/**` returns these
 * shapes; phone (`/m/racks`, `/m/loc/RK…`) and desk surfaces read them. The
 * room is DERIVED server-side by walking `parent_id` to the nearest ROOM; it is
 * never copied onto a rack/shelf row and never printed.
 */

/** Where a rack can stand: a room, or a floor/staging spot inside one. */
export type RackPlacementKind = 'ROOM' | 'STAGING';

export interface RackPlacementRef {
  id: number;
  /** `locations.barcode` of the placement (the label an operator scans), or null for an unlabelled room. */
  code: string | null;
  name: string;
  kind: RackPlacementKind;
}

export interface RackRoomRef {
  id: number;
  name: string;
  code: string | null;
}

export interface RackShelf {
  id: number;
  /** Canonical barcode: `RK12-3`, or the kept legacy code for an adopted bay shelf. */
  code: string;
  name: string;
  /** Shelf number on the rack (1-based). */
  shelf: number;
  capacity: number | null;
  sortOrder: number | null;
  /** Units held (sum of `bin_contents.qty`); remove is refused while > 0. */
  stockQty: number;
  positions: Array<{ id: number; code: string; name: string; position: number }>;
}

export interface RackSummary {
  id: number;
  /** `RK12`. */
  code: string;
  /** `Rack 12`. */
  name: string;
  rackNumber: number;
  placement: RackPlacementRef;
  /** Nearest ROOM up the parent chain; null when the chain reaches none. */
  room: RackRoomRef | null;
  shelfCount: number;
  /** Last `location.rack.moved` (or creation) instant, ISO. */
  lastMovedAt: string;
}

export interface RackDetail extends RackSummary {
  shelves: RackShelf[];
}

/** Most shelves one rack carries (create, add). */
export const RACK_MAX_SHELVES = 50;
/** Most positions one shelf is subdivided into. */
export const RACK_MAX_POSITIONS_PER_SHELF = 50;
/** `location_kind` of a movable-rack shelf/position: a stock place, like a legacy BIN. */
export const RACK_STOCK_KINDS: ReadonlySet<string> = new Set(['SHELF', 'POSITION']);
/** Every rack-family `location_kind` — never a room, even though none carries row/col labels. */
export const RACK_FAMILY_KINDS: ReadonlySet<string> = new Set(['RACK', 'SHELF', 'POSITION']);

/** POST /api/racks */
export interface CreateRackBody {
  /** Scanned/typed label of the ROOM or STAGING spot the rack stands in. Exactly one of code/id. */
  placementCode?: string;
  /** Manual-pick fallback (and rooms with no label): the placement row id. */
  placementId?: number;
  /** 1..50 shelves. */
  shelves: number;
  /** Positions per shelf; omit/0 for shelf-level only (D2 default). */
  positionsPerShelf?: number;
  dryRun?: boolean;
  clientEventId: string;
}

export interface PlannedRack {
  code: string;
  name: string;
  rackNumber: number;
  placement: RackPlacementRef;
  room: RackRoomRef | null;
  shelves: Array<{ code: string; name: string; shelf: number; positions: string[] }>;
}

export type CreateRackResponse =
  | { dryRun: true; planned: PlannedRack }
  | { dryRun: false; rack: RackDetail; idempotent: boolean };

/** GET /api/racks?placement=<code>&room=<id> */
export interface ListRacksResponse {
  racks: RackSummary[];
}

/** GET /api/racks/[code] — `code` is any rack spelling; shelf codes resolve to their rack. */
export interface GetRackResponse {
  rack: RackDetail;
}

/** DELETE /api/racks/[code] — soft-delete an empty rack and its descendants. */
export interface DeleteRackBody {
  clientEventId: string;
}

export interface DeleteRackResponse {
  rackId: number;
  code: string;
  retired: string[];
  idempotent: boolean;
}

/** POST /api/racks/[code]/move */
export interface MoveRackBody {
  /** Scanned destination label. Exactly one of code/id. */
  destinationCode?: string;
  /** Manual pick fallback and Undo (the receipt's `from.id`). Same validation as a scan. */
  destinationId?: number;
  clientEventId: string;
}

export interface MoveRackResponse {
  rack: RackDetail;
  from: RackPlacementRef;
  to: RackPlacementRef;
  /** True when this clientEventId already moved the rack; nothing changed. */
  idempotent: boolean;
}

/** POST /api/racks/[code]/shelves */
export interface EditRackShelvesBody {
  /** Append N shelves after the highest shelf number. */
  add?: number;
  /** Shelf codes to retire; refused (409) while any holds stock or cartons. */
  remove?: string[];
  clientEventId: string;
}

export interface EditRackShelvesResponse {
  rack: RackDetail;
  added: string[];
  removed: string[];
}

/** POST /api/racks/[code]/labels-printed — after a successful print run. */
export interface RackLabelsPrintedBody {
  codes: string[];
  transport: string;
  clientEventId: string;
}

/** POST /api/racks/adopt — phase 7: turn a legacy aisle-bay into a rack. */
export interface AdoptBayBody {
  /** Any legacy code on the bay: `C-04-07`, `C-04-07-3`, `C0407300`. Zone+aisle+bay identify the bay. */
  bayCode: string;
  /** Keep the printed `C…` shelf barcodes (true) or re-code them `RK<n>-<level>` (false, needs reprint). */
  keepBarcodes: boolean;
  dryRun?: boolean;
  clientEventId: string;
}

/**
 * One row of an adoption plan. Existing bay rows carry their id and current
 * code; `id: null, from: null` is a SHELF row the adoption creates (a level
 * whose only rows were positions). `position` null = a shelf (level) row.
 */
export interface AdoptBayPlanRow {
  id: number | null;
  from: string | null;
  to: string;
  shelf: number;
  position: number | null;
}

export interface AdoptBayPlan {
  rack: { code: string; name: string };
  placement: RackPlacementRef;
  room: RackRoomRef | null;
  shelves: AdoptBayPlanRow[];
}

export type AdoptBayResponse =
  | { dryRun: true; planned: AdoptBayPlan }
  | { dryRun: false; rack: RackDetail; idempotent: boolean };

/** Every `RackErrorBody.code` a rack route can answer. */
export const RACK_ERROR_CODES = [
  'invalid',
  'not_found',
  'destination_not_found',
  'destination_kind',
  'same_placement',
  'shelf_has_stock',
  'rack_in_use',
  'not_a_rack',
  'bay_not_found',
  'bay_already_adopted',
] as const;

export type RackErrorCode = (typeof RACK_ERROR_CODES)[number];

export function isRackErrorCode(v: unknown): v is RackErrorCode {
  return typeof v === 'string' && (RACK_ERROR_CODES as readonly string[]).includes(v);
}

/** Error body every rack route returns on 4xx. */
export interface RackErrorBody {
  error: string;
  code: RackErrorCode;
}
