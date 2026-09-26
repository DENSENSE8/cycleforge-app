/** Arrival "new location" slot math — pure, DB-free. */

import { parseLocationCodeFlat } from '@/lib/barcode-routing';
import type { Location } from '@/lib/neon/location-queries';

/** Highest slot the printer will address; matches the register route's 1..99. */
export const MAX_SLOT = 99;

interface SlotAddress {
  zone: string;
  aisle: number;
  bay: number;
  level: number;
}

/**
 * Zone letter for a room, read off the parent rows (the SoT mark lives there;
 * bins keep it NULL). Null when the room has never been printed — the operator
 * has to pick a letter, and the leaf says so rather than guessing one.
 */
export function zoneLetterForRoom(
  rooms: readonly Location[],
  room: string,
): string | null {
  const key = String(room ?? '').trim().toLowerCase();
  if (!key) return null;
  for (const r of rooms) {
    const name = (r.room || r.name || '').trim().toLowerCase();
    if (name !== key) continue;
    const letter = (r.zone_letter || '').trim().toUpperCase();
    if (/^[A-Z]$/.test(letter)) return letter;
  }
  return null;
}

/**
 * The only field an occupancy read needs. Widened from `Location` so the
 * shared station Locations leaf can pass its own port rows without inflating
 * them into full catalog rows — the address IS the barcode.
 */
interface AddressedLocation {
  barcode: string | null;
}

/**
 * Every position already taken on one zone/aisle/bay/level, read from the
 * barcodes themselves rather than a count — a soft-deleted or out-of-order
 * catalog must not hand back an address that is physically occupied.
 */
export function occupiedPositions(
  locations: readonly AddressedLocation[],
  at: SlotAddress,
): number[] {
  const zone = String(at.zone ?? '').trim().toUpperCase();
  if (!/^[A-Z]$/.test(zone)) return [];
  const taken = new Set<number>();
  for (const loc of locations) {
    const seg = parseLocationCodeFlat((loc.barcode ?? '').trim());
    if (!seg) continue;
    if (String(seg.zone).toUpperCase() !== zone) continue;
    if (Number(seg.aisle) !== at.aisle) continue;
    if (Number(seg.bay) !== at.bay) continue;
    if (Number(seg.level) !== at.level) continue;
    // position 0 is the whole-rack label sentinel, never a placeable slot.
    const pos = Number(seg.position);
    if (pos >= 1 && pos <= MAX_SLOT) taken.add(pos);
  }
  return Array.from(taken).sort((a, b) => a - b);
}

/** The next free position on that level, or null when the level is full. */
export function suggestNextPosition(
  locations: readonly AddressedLocation[],
  at: SlotAddress,
): number | null {
  const taken = new Set(occupiedPositions(locations, at));
  for (let pos = 1; pos <= MAX_SLOT; pos += 1) {
    if (!taken.has(pos)) return pos;
  }
  return null;
}

/** Rooms that can host a printed bin, in catalog order, de-duplicated. */
export function printableRoomNames(rooms: readonly Location[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rooms) {
    const name = (r.room || r.name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
