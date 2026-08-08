/**
 * locations repository
 * ────────────────────────────────────────────────────────────────────
 * Typed reads against the bin-addressable locations table and its
 * bin_contents projection. Distinct from the legacy zoho_locations
 * mirror (which lives in itemRepository.ts).
 *
 * Important: bin_contents rows are now MAINTAINED via the sku_stock_ledger
 * + trigger flow (since 2026-04-15). Callers that need to mutate quantity
 * should write to skuStockLedger (see ./stockLedger.ts), not to this
 * module's hypothetical mutators.
 */
import { db } from '@/lib/drizzle/db';
import { binContents, locations } from '@/lib/drizzle/schema';
import type { BinContent, Location } from '@/lib/drizzle/schema';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

export async function findLocationByBarcode(barcode: string): Promise<Location | null> {
  const rows = await db.select().from(locations).where(eq(locations.barcode, barcode)).limit(1);
  return rows[0] ?? null;
}

export async function findLocationByName(name: string): Promise<Location | null> {
  const rows = await db.select().from(locations).where(eq(locations.name, name)).limit(1);
  return rows[0] ?? null;
}

interface ListBinsOptions {
  room?: string;
  activeOnly?: boolean;
  binType?: string;
  limit?: number;
}

