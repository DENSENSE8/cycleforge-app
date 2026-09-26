/** Directed (system-fed) picking — the pure half. */

export interface DirectedPickUnit {
  allocationId: number;
  serialUnitId: number;
  serialNumber: string | null;
}

export interface DirectedPickPlatformId {
  platformSku: string | null;
  platformItemId: string | null;
}

export interface DirectedPickLocation {
  /** `locations.name` — the face a human reads (`C-04-15-1`). */
  name: string | null;
  /** `locations.barcode` — what the bin label encodes (`C0415100`). */
  barcode: string | null;
  /** `locations.room` — the zone (`Zone 3 - Parts`). */
  room: string | null;
}

/** One card on the directed screen: one order, one SKU, one bin, N units. */
export interface DirectedPickLine {
  key: string;
  orderId: number;
  sku: string;
  title: string;
  imageUrl: string | null;
  /** `null` when the units have no bin on record — the location step is skipped. */
  location: DirectedPickLocation | null;
  units: DirectedPickUnit[];
  platforms: DirectedPickPlatformId[];
}

/** Why an order's pick belongs to a picker: */
export type PickOwnerVia = 'assigned' | 'sku' | 'backup';

export interface PickStaffRef {
  staffId: number;
  name: string | null;
}

export interface PickOwner extends PickStaffRef {
  via: PickOwnerVia;
}

/** The order a line belongs to, as the directed screen's order card shows it. */
export interface DirectedPickOrder {
  orderId: number;
  orderLabel: string;
  /** `orders.account_source` — the channel the order came in on (`amazon`, `ebay_…`). */
  accountSource: string | null;
  /** `orders.item_number` — the listing id (ASIN / eBay item) the listing link opens. */
  itemNumber: string | null;
  /** Exact SLA from the order's TEST work assignment — the same deadline the to-ship card counts down. */
  deadlineAt: string | null;
  /** Ship-by inside 24h (or overdue) — the card wears the danger edge. */
  rush: boolean;
  /** Open units left in the order, this line included. */
  unitsRemaining: number;
  /** An OPEN tote already paired to the order — the phone arms it without a scan. */
  toteCode: string | null;
  /** Who the pick belongs to; `null` = unassigned, anyone may take it. */
  owner: PickOwner | null;
  /** Auto-selected backup pickers — they get it when the owner is out. */
  backups: PickStaffRef[];
}

/** `POST /api/v1/picking/next` — one line, or `line: null` when the run is empty. */
export interface DirectedPickNext {
  sessionId: number | null;
  order: DirectedPickOrder | null;
  line: DirectedPickLine | null;
  /** Units picked or shorted by this picker since the run began / that total plus every unit still open. */
  progress: { done: number; total: number };
  /** Totes staged for pack by sessions this call closed. */
  stagedTotes: string[];
  /** Orders with open picks and no owner — the Unassigned board's count. */
  unassignedCount: number;
}

/** One order on the pick board (`GET /api/v1/picking/board`). */
export interface PickBoardRow {
  orderId: number;
  orderLabel: string;
  accountSource: string | null;
  deadlineAt: string | null;
  rush: boolean;
  openUnits: number;
  /** The first line in walk order — what the picker walks to first. */
  title: string;
  imageUrl: string | null;
  location: DirectedPickLocation | null;
  owner: PickOwner | null;
  backups: PickStaffRef[];
  /** Another picker's live session on the order, if any. */
  heldBy: PickStaffRef | null;
}

export type PickBoardScope = 'unassigned' | 'all';

/** A unit row as the feed reads it, already in walk order. */
export interface DirectedPickUnitRow extends DirectedPickUnit {
  sku: string;
  title: string;
  imageUrl: string | null;
  locationName: string | null;
  locationBarcode: string | null;
  locationRoom: string | null;
  /** `serial_units.current_location` when no `locations` row matched it. */
  rawLocation: string | null;
  platforms: DirectedPickPlatformId[];
}

/**
 * Fold an order's unit rows into lines, keeping the rows' walk order: the
 * first row of each (SKU, bin) decides where that line sits. Two units of the
 * same SKU in two bins are two lines — the picker walks to each.
 */
export function groupDirectedPickLines(orderId: number, rows: readonly DirectedPickUnitRow[]): DirectedPickLine[] {
  const lines = new Map<string, DirectedPickLine>();
  for (const row of rows) {
    const where = row.locationBarcode ?? row.locationName ?? row.rawLocation ?? '';
    const key = `${orderId}:${row.sku}:${where}`;
    let line = lines.get(key);
    if (!line) {
      const hasLocation = Boolean(row.locationBarcode || row.locationName || row.rawLocation);
      line = {
        key,
        orderId,
        sku: row.sku,
        title: row.title,
        imageUrl: row.imageUrl,
        location: hasLocation
          ? {
              name: row.locationName ?? (row.locationBarcode ? null : row.rawLocation),
              barcode: row.locationBarcode,
              room: row.locationRoom,
            }
          : null,
        units: [],
        platforms: row.platforms,
      };
      lines.set(key, line);
    }
    line.units.push({ allocationId: row.allocationId, serialUnitId: row.serialUnitId, serialNumber: row.serialNumber });
  }
  return [...lines.values()];
}

/**
 * Scanner-agnostic form of a code: upper-case alphanumerics only. A bin label
 * read by a gun (`C0415100`) and the same bin typed from its face
 * (`c-04-15-1-00`) must compare equal.
 */
function normalizeScanCode(raw: string): string {
  return String(raw ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** The face the screen paints for a bin, largest text on the screen. */
export function locationFace(location: DirectedPickLocation | null): string {
  if (!location) return 'No bin on record';
  return location.name || location.barcode || 'No bin on record';
}

/** Does this scan name the line's bin — its label barcode or its typed face? */
export function matchesLocationScan(scan: string, location: DirectedPickLocation | null): boolean {
  if (!location) return false;
  const code = normalizeScanCode(scan);
  if (!code) return false;
  return [location.barcode, location.name].some((face) => normalizeScanCode(face ?? '') === code);
}

const INTERNAL_UNIT_QR = /\/m\/u\/(\d+)(?:[/?#]|$)/;

/** Which open unit of the line this item scan picks, or `null` when the scan is not this product. */
export function matchItemScan(
  scan: string,
  line: DirectedPickLine,
  done: ReadonlySet<number>,
): number | null {
  const raw = scan.trim();
  if (!raw) return null;
  const open = line.units.filter((u) => !done.has(u.allocationId));
  if (open.length === 0) return null;
  const lower = raw.toLowerCase();

  const bySerial = open.find((u) => u.serialNumber && u.serialNumber.trim().toLowerCase() === lower);
  if (bySerial) return bySerial.allocationId;

  const qr = INTERNAL_UNIT_QR.exec(raw);
  if (qr) {
    const unit = open.find((u) => u.serialUnitId === Number(qr[1]));
    return unit ? unit.allocationId : null;
  }

  const isProduct =
    line.sku.trim().toLowerCase() === lower ||
    line.platforms.some(
      (p) => p.platformSku?.trim().toLowerCase() === lower || p.platformItemId?.trim().toLowerCase() === lower,
    );
  return isProduct ? open[0].allocationId : null;
}

export type DirectedPickStep = 'tote' | 'location' | 'item' | 'done';

/**
 * The step the screen is on. Tote first (one per order — `pick.confirm`
 * refuses a pick without one), then the bin, then one scan per unit.
 */
export function directedPickStep(state: {
  line: DirectedPickLine | null;
  toteArmed: boolean;
  locationConfirmed: boolean;
  pickedCount: number;
}): DirectedPickStep {
  const { line } = state;
  if (!line) return 'done';
  if (state.pickedCount >= line.units.length) return 'done';
  if (!state.toteArmed) return 'tote';
  if (line.location && !state.locationConfirmed) return 'location';
  return 'item';
}

/** The instruction line above the dock, per step. */
export function directedPickInstruction(step: DirectedPickStep, line: DirectedPickLine | null, pickedCount: number): string {
  if (step === 'tote') return 'Scan a tote for this order';
  if (step === 'location') return 'Scan location barcode';
  if (step === 'item' && line) {
    const left = line.units.length - pickedCount;
    return line.units.length > 1 ? `Scan item · ${left} of ${line.units.length} left` : 'Scan item';
  }
  return 'Line complete';
}
