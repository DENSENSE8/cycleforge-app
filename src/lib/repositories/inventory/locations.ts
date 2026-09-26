/** locations repository ──────────────────────────────────────────────────────────────────── Typed reads against the bin-addressable… */
import { db } from '@/lib/drizzle/db';
import { locations } from '@/lib/drizzle/schema';
import type { Location } from '@/lib/drizzle/schema';
import { eq } from 'drizzle-orm';

export async function findLocationByBarcode(barcode: string): Promise<Location | null> {
  const rows = await db.select().from(locations).where(eq(locations.barcode, barcode)).limit(1);
  return rows[0] ?? null;
}

export async function findLocationByName(name: string): Promise<Location | null> {
  const rows = await db.select().from(locations).where(eq(locations.name, name)).limit(1);
  return rows[0] ?? null;
}

