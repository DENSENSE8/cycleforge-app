/**
 * WMS read tools — "where is this item" and "what is in this bin"
 * (docs plan: wms-ai-tool-db-plan §3.1 / §3.2). GREEN, org-scoped reads.
 *
 * Both tools answer with a SERVER-CARRIED table (`brandReportEnvelope`): the
 * rows Postgres returned go straight to the panel, and the model reads only a
 * short summary that already states the bins and quantities in words. The
 * model never retypes a bin or a count, and the panel opens without the model
 * having to remember `render_artifact`. A miss is a plain result that names
 * everything that was searched, so "not found" is said honestly instead of
 * pointing at a panel that has nothing on it.
 *
 * Every statement carries an explicit `organization_id = $1` predicate on top
 * of the tenant GUC (`tools/types.ts` rule). SKU identity follows the law:
 * catalog joined with `skuCatalogJoinOnSql`, title through
 * `resolveSkuIdentityTitle` (the Zoho item governs).
 */

import { z } from 'zod';
import { scannedFnsku } from '@/lib/scan-resolver';
import { escapeLike } from '@/lib/sql-like';
import { resolveSkuIdentityTitle, skuCatalogJoinOnSql } from '@/lib/sku/sku-identity-law';
import { brandReportEnvelope, type ToolArtifactEnvelope } from '@/lib/assistant/tool-artifact';
import type { ArtifactTable } from '@/lib/assistant/ui-artifacts';
import type { AssistantToolDef } from './types';

// ─── Classification (pure) ───────────────────────────────────────────────────

export const LOCATE_KINDS = ['auto', 'sku', 'fnsku', 'asin', 'gtin', 'serial', 'lpn', 'title'] as const;
export type LocateKindInput = (typeof LOCATE_KINDS)[number];

/**
 * What the lookup runs as. `identifier` is the default arm: one statement
 * tries SKU, FNSKU, ASIN, GTIN/UPC/EAN and marketplace ids together, then a
 * serial when nothing matched.
 */
export type LocateRoute = 'identifier' | 'serial' | 'lpn' | 'title';

export interface ClassifiedLocateQuery {
  /** The cleaned value the SQL binds. */
  value: string;
  route: LocateRoute;
}

/**
 * A label word the operator (or the model) typed in front of the value:
 * "SKU 00066-P-2", "fnsku: X00…", "bin #C-03-12-3". Stripped only when a value
 * follows it, so a bare word is never erased.
 */
const LEADING_LABEL = /^(?:sku|fnsku|asin|upc|gtin|ean|lpn|serial|sn|item|product|bin|location)\s*(?:#|:|no\.?|number)?\s+(?=\S)|^(?:sku|fnsku|asin|upc|gtin|ean|lpn|serial|sn|bin|location)\s*[#:]\s*(?=\S)/i;

/** Trim quotes, trailing punctuation and one leading label word. */
export function cleanLocateValue(raw: string): string {
  let v = raw.trim().replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '').replace(/[?.!,;]+$/, '').trim();
  v = v.replace(LEADING_LABEL, '').trim();
  return v.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '').trim();
}

/**
 * Decide how to look a query up. An explicit `kind` wins; `auto` reads the
 * shape. FNSKU / ASIN / GTIN / SKU all ride the identifier arm (one statement
 * matches every identifier column), so the shape only has to separate LPNs,
 * serials and free-text titles from identifiers.
 */
export function classifyLocateQuery(raw: string, kind: LocateKindInput = 'auto'): ClassifiedLocateQuery {
  const value = cleanLocateValue(raw);
  if (kind === 'serial' || kind === 'lpn' || kind === 'title') return { value, route: kind };
  if (kind !== 'auto') return { value: kind === 'sku' ? value : value.toUpperCase(), route: 'identifier' };
  if (/^H-\d+$/i.test(value)) return { value: value.toUpperCase(), route: 'lpn' };
  const fnsku = scannedFnsku(value);
  if (fnsku) return { value: fnsku, route: 'identifier' };
  if (/^B0[A-Z0-9]{8}$/i.test(value)) return { value: value.toUpperCase(), route: 'identifier' };
  // Two or more words with letters is a product name, not an identifier.
  if (/\s/.test(value) && /[a-z]{3,}/i.test(value)) return { value, route: 'title' };
  return { value, route: 'identifier' };
}

// ─── Shared shaping ──────────────────────────────────────────────────────────

const LOCATION_FACE_SQL = `COALESCE(NULLIF(btrim(l.display_name), ''), l.name)`;

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function day(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function envelope(tool: string, artifact: ArtifactTable, summary: string): ToolArtifactEnvelope {
  return brandReportEnvelope({ artifact, summary }, tool);
}

/** "C-03-12-3: 41, C-03-16-3: 1" — at most `max` bins, then "+N more". */
function binList(bins: ReadonlyArray<{ location: string; qty: number }>, max = 10): string {
  const shown = bins.slice(0, max).map((b) => `${b.location}: ${b.qty}`);
  const rest = bins.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} (+${rest} more bins in the table)` : shown.join(', ');
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ─── locate_product ──────────────────────────────────────────────────────────

const IDENTIFIER_SQL = `
WITH q AS (SELECT btrim($2::text) AS raw, upper(btrim($2::text)) AS up),
hit AS (
  SELECT sc.organization_id, sc.sku, 'sku'::text AS via, NULL::text AS listing_title
    FROM sku_catalog sc, q
   WHERE sc.organization_id = $1 AND upper(sc.sku) = q.up
  UNION
  SELECT bc.organization_id, bc.sku, 'sku', NULL
    FROM bin_contents bc, q
   WHERE bc.organization_id = $1 AND upper(bc.sku) = q.up
  UNION
  SELECT f.organization_id, f.sku, 'fnsku', f.product_title
    FROM fba_fnskus f, q
   WHERE f.organization_id = $1 AND upper(btrim(f.fnsku)) = q.up AND f.sku IS NOT NULL
  UNION
  SELECT f.organization_id, f.sku, 'asin', f.product_title
    FROM fba_fnskus f, q
   WHERE f.organization_id = $1 AND upper(btrim(f.asin)) = q.up AND f.sku IS NOT NULL
  UNION
  SELECT sc.organization_id, sc.sku, 'gtin', NULL
    FROM sku_catalog sc, q
   WHERE sc.organization_id = $1 AND q.raw IN (sc.gtin, sc.upc, sc.ean)
  UNION
  SELECT sc.organization_id, sc.sku, 'marketplace id', spi.listing_title
    FROM sku_platform_ids spi
    JOIN sku_catalog sc ON sc.id = spi.sku_catalog_id AND sc.organization_id = spi.organization_id, q
   WHERE spi.organization_id = $1 AND q.raw IN (spi.platform_sku, spi.platform_item_id)
)
SELECT h.sku, h.via, h.listing_title,
       i.name AS zoho_item_title,
       sc.product_title AS catalog_product_title,
       (SELECT f2.fnsku FROM fba_fnskus f2, q
         WHERE f2.organization_id = h.organization_id AND f2.sku = h.sku AND f2.fnsku IS NOT NULL
         ORDER BY (upper(btrim(f2.fnsku)) = q.up) DESC, f2.fnsku LIMIT 1) AS fnsku,
       bl.location_id, bl.location, bl.barcode, bl.room, bl.bin_role,
       bl.qty, bl.min_qty, bl.max_qty, bl.last_counted
  FROM hit h
  LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('h')}
  LEFT JOIN items i ON i.zoho_item_id = sc.provider_item_id
                   AND i.organization_id = sc.organization_id AND i.status = 'active'
  LEFT JOIN LATERAL (
    SELECT l.id AS location_id, ${LOCATION_FACE_SQL} AS location, l.barcode, l.room, l.bin_role,
           bc.qty, bc.min_qty, bc.max_qty, bc.last_counted, l.row_label, l.col_label
      FROM bin_contents bc
      JOIN locations l ON l.id = bc.location_id AND l.organization_id = bc.organization_id AND l.is_active
     WHERE bc.organization_id = h.organization_id AND bc.sku = h.sku AND (bc.qty > 0 OR $3::boolean)
  ) bl ON true
 ORDER BY bl.qty DESC NULLS LAST, bl.room, bl.row_label, bl.col_label
 LIMIT 200`;

const SERIAL_SQL = `
SELECT su.serial_number, su.sku, su.current_status, su.current_location,
       hu.code AS lpn, ${LOCATION_FACE_SQL} AS location
  FROM serial_units su
  LEFT JOIN handling_units hu ON hu.id = su.handling_unit_id AND hu.organization_id = su.organization_id
  LEFT JOIN locations l ON l.id = hu.location_id AND l.organization_id = hu.organization_id
 WHERE su.organization_id = $1 AND su.normalized_serial = upper(btrim($2::text))
 LIMIT 5`;

const LPN_SQL = `
SELECT hu.code, hu.status, ${LOCATION_FACE_SQL} AS location,
       (SELECT count(*) FROM serial_units su
         WHERE su.organization_id = $1 AND su.handling_unit_id = hu.id) AS units
  FROM handling_units hu
  LEFT JOIN locations l ON l.id = hu.location_id AND l.organization_id = hu.organization_id
 WHERE hu.organization_id = $1 AND upper(hu.code) = upper(btrim($2::text))
 LIMIT 1`;

const TITLE_SQL = `
SELECT sc.sku, i.name AS zoho_item_title, sc.product_title AS catalog_product_title,
       (SELECT COALESCE(sum(bc.qty), 0) FROM bin_contents bc
         WHERE bc.organization_id = $1 AND bc.sku = sc.sku AND bc.qty > 0) AS on_hand
  FROM sku_catalog sc
  LEFT JOIN items i ON i.zoho_item_id = sc.provider_item_id
                   AND i.organization_id = sc.organization_id AND i.status = 'active'
 WHERE sc.organization_id = $1
   AND (sc.is_active OR EXISTS (SELECT 1 FROM bin_contents b2
         WHERE b2.organization_id = $1 AND b2.sku = sc.sku AND b2.qty > 0))
   AND (sc.product_title ILIKE '%' || $2 || '%' ESCAPE '\\' OR i.name ILIKE '%' || $2 || '%' ESCAPE '\\')
 ORDER BY on_hand DESC, sc.sku
 LIMIT 25`;

/** Everything the identifier arm checks — named verbatim in a miss. */
const IDENTIFIER_SEARCHED = ['SKU', 'FNSKU', 'ASIN', 'UPC/EAN/GTIN', 'marketplace SKU / item id', 'serial number'];

const locateInput = z.object({
  query: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .describe('Exactly what the operator typed or scanned: a SKU, FNSKU (X00…), ASIN (B0…), UPC/GTIN, serial, LPN (H-123) or a product name.'),
  kind: z
    .enum(LOCATE_KINDS)
    .default('auto')
    .describe('Leave "auto" unless the operator said what the value is.'),
  includeEmpty: z.boolean().default(false).describe('Also list slotted bins holding 0.'),
});

interface BinRow {
  location: string;
  barcode: string | null;
  room: string | null;
  role: string | null;
  qty: number;
  min: number | null;
  max: number | null;
  lastCounted: string | null;
}

interface SkuHit {
  sku: string;
  title: string;
  fnsku: string | null;
  via: string;
  bins: BinRow[];
}

function foldIdentifierRows(rows: ReadonlyArray<Record<string, unknown>>): SkuHit[] {
  const bySku = new Map<string, SkuHit>();
  const seenBin = new Set<string>();
  for (const r of rows) {
    const sku = str(r.sku);
    if (!sku) continue;
    let hit = bySku.get(sku);
    if (!hit) {
      hit = {
        sku,
        title: resolveSkuIdentityTitle({
          zoho_item_title: str(r.zoho_item_title),
          catalog_product_title: str(r.catalog_product_title),
          item_name: str(r.listing_title),
          sku,
        }),
        fnsku: str(r.fnsku),
        via: String(r.via ?? 'sku'),
        bins: [],
      };
      bySku.set(sku, hit);
    } else if (hit.via !== 'sku' && r.via === 'sku') {
      hit.via = 'sku';
    }
    const location = str(r.location);
    const qty = num(r.qty);
    if (!location || qty === null) continue;
    const key = `${sku}\u0000${String(r.location_id)}`;
    if (seenBin.has(key)) continue;
    seenBin.add(key);
    hit.bins.push({
      location,
      barcode: str(r.barcode),
      room: str(r.room),
      role: str(r.bin_role),
      qty,
      min: num(r.min_qty),
      max: num(r.max_qty),
      lastCounted: day(r.last_counted),
    });
  }
  return [...bySku.values()];
}

/** How many bin chips a product header carries before the table takes over. */
const HEADER_BINS = 8;

/**
 * The location table for stocked hits. One SKU → the SKU, its title and its
 * identifiers ride in the product header and the rows are just bins; several
 * SKUs → SKU/Title columns. Min / Max / Last counted appear only when some bin
 * actually has a value.
 */
function locateTable(query: string, hits: ReadonlyArray<SkuHit>): ArtifactTable {
  const single = hits.length === 1;
  const bins = hits.flatMap((h) => h.bins.map((b) => ({ h, b })));
  const optional = (['Min', 'Max', 'Last counted'] as const).filter((col) =>
    bins.some(({ b }) => (col === 'Min' ? b.min : col === 'Max' ? b.max : b.lastCounted) !== null),
  );
  const columns = [...(single ? [] : ['SKU']), 'Bin', 'Room', 'Qty', ...optional, ...(single ? [] : ['Title'])];
  const rows = bins.map(({ h, b }) => ({
    SKU: h.sku,
    Title: h.title,
    Bin: b.location,
    Room: b.room,
    Qty: b.qty,
    Min: b.min,
    Max: b.max,
    'Last counted': b.lastCounted,
  }));
  return {
    kind: 'table',
    title: (single ? `Where is ${hits[0].sku} · ${hits[0].title}` : `Where is ${query}`).slice(0, 120),
    columns,
    rows: rows.slice(0, 200),
    entityHint: 'bin',
    idColumn: 'Bin',
    ...(single
      ? {
          product: {
            title: hits[0].title.slice(0, 120),
            ids: [
              { label: 'SKU' as const, value: hits[0].sku },
              ...(hits[0].fnsku ? [{ label: 'FNSKU' as const, value: hits[0].fnsku }] : []),
              ...hits[0].bins.slice(0, HEADER_BINS).map((b) => ({ label: 'Bin' as const, value: b.location })),
            ],
          },
        }
      : {}),
  };
}

export const locateProduct: AssistantToolDef<typeof locateInput> = {
  name: 'locate_product',
  description:
    'WHERE IS an item in the warehouse: which bins hold it and how many. Use for "where is SKU …", "which bin has …", "how many … do we have", FNSKU / ASIN / UPC / serial / LPN / product-name lookups. Pass the value exactly as typed. Returns the bins and quantities (and shows the location table to the operator itself) or found=false with what was searched.',
  permission: 'sku_stock.view',
  inputSchema: locateInput,
  run: async (input, ctx, deps) => {
    const org = ctx.organizationId;
    const { value, route } = classifyLocateQuery(input.query, input.kind);
    if (value.length < 2) {
      return { found: false, query: input.query, message: 'The lookup value is empty after removing the label word.' };
    }

    if (route === 'lpn') {
      const { rows } = await deps.query(org, LPN_SQL, [org, value]);
      const hu = rows[0];
      if (!hu) {
        return { found: false, query: value, searched: ['LPN (handling unit code)'], message: `No handling unit ${value} exists in this workspace.` };
      }
      return {
        found: true,
        kind: 'lpn',
        lpn: str(hu.code),
        status: str(hu.status),
        location: str(hu.location),
        units: num(hu.units) ?? 0,
        message: `${str(hu.code)} (${str(hu.status)}) holds ${plural(num(hu.units) ?? 0, 'unit')} and is ${str(hu.location) ? `in ${str(hu.location)}` : 'not assigned to a bin'}.`,
      };
    }

    if (route === 'title') {
      const { rows } = await deps.query(org, TITLE_SQL, [org, escapeLike(value)]);
      if (rows.length === 0) {
        return { found: false, query: value, searched: ['product title', 'Zoho item name'], message: `No active product title contains "${value}".` };
      }
      const candidates = rows.map((r) => ({
        sku: String(r.sku),
        title: resolveSkuIdentityTitle({ zoho_item_title: str(r.zoho_item_title), catalog_product_title: str(r.catalog_product_title), sku: String(r.sku) }),
        onHand: num(r.on_hand) ?? 0,
      }));
      if (candidates.length === 1) {
        return locateProduct.run({ query: candidates[0].sku, kind: 'sku', includeEmpty: input.includeEmpty }, ctx, deps);
      }
      const artifact: ArtifactTable = {
        kind: 'table',
        title: `Products matching "${value}"`.slice(0, 120),
        columns: ['SKU', 'Title', 'On hand'],
        rows: candidates.map((c) => ({ SKU: c.sku, Title: c.title, 'On hand': c.onHand })),
        entityHint: 'SKU',
        idColumn: 'SKU',
      };
      const top = candidates.slice(0, 5).map((c) => `${c.sku} (${c.title}, ${c.onHand} on hand)`).join('; ');
      return envelope(
        'locate_product',
        artifact,
        `${candidates.length} products match "${value}" — the candidates table is already on screen (do not render it again). Top: ${top}. Ask the operator which SKU they mean; do not pick one.`,
      );
    }

    const { rows } = await deps.query(org, IDENTIFIER_SQL, [org, value, input.includeEmpty]);
    const hits = foldIdentifierRows(rows);

    if (hits.length === 0) {
      // Not an identifier we know — it may be a serial number.
      const serial = await deps.query(org, SERIAL_SQL, [org, value]);
      const unit = serial.rows[0];
      if (unit) {
        const sku = str(unit.sku);
        const where = str(unit.location) ?? str(unit.current_location);
        return {
          found: true,
          kind: 'serial',
          serial: str(unit.serial_number),
          sku,
          status: str(unit.current_status),
          lpn: str(unit.lpn),
          location: where,
          message: `Serial ${str(unit.serial_number)}${sku ? ` (SKU ${sku})` : ''} is ${str(unit.current_status) ?? 'in an unknown status'}${where ? `, location ${where}` : ', with no recorded location'}${str(unit.lpn) ? `, on LPN ${str(unit.lpn)}` : ''}.`,
        };
      }
      return {
        found: false,
        query: value,
        searched: IDENTIFIER_SEARCHED,
        message: `Nothing in this workspace matches "${value}" (searched ${IDENTIFIER_SEARCHED.join(', ')}). No bins to show.`,
      };
    }

    const stocked = hits.filter((h) => h.bins.length > 0);
    if (stocked.length === 0) {
      const names = hits
        .map((h) => `${h.via === 'sku' ? '' : `${h.via.toUpperCase()} ${value} belongs to `}SKU ${h.sku} (${h.title})`)
        .join('; ');
      return {
        found: true,
        inStock: false,
        query: value,
        matched: hits.map((h) => ({ sku: h.sku, title: h.title, matchedAs: h.via })),
        bins: [],
        message: `${names}. No bin holds any stock of ${hits.length === 1 ? `SKU ${hits[0].sku}` : 'these SKUs'} right now (0 units on hand in bins). No table was shown.`,
      };
    }

    const lines = stocked.map((h) => {
      const total = h.bins.reduce((s, b) => s + b.qty, 0);
      return `SKU ${h.sku}${h.via !== 'sku' ? ` [matched as ${h.via}]` : ''}: ${total} units in ${plural(h.bins.length, 'bin')} — ${binList(h.bins)}`;
    });
    return envelope(
      'locate_product',
      locateTable(value, stocked),
      `${lines.join('. ')}. The location table and the product title are already on screen — do not render them again. Product titles, for your understanding only (already shown as the heading; never write them in the answer): ${stocked.map((h) => `${h.sku} = ${h.title}`).join('; ')}.`,
    );
  },
};

// ─── list_location_contents ──────────────────────────────────────────────────

const LOCATION_SQL = `
SELECT l.id, l.name, ${LOCATION_FACE_SQL} AS location, l.barcode, l.room, l.location_kind, l.bin_role, l.locked_for_count
  FROM locations l
 WHERE l.organization_id = $1 AND l.is_active
   AND (upper(l.barcode) = upper(btrim($2::text)) OR upper(l.name) = upper(btrim($2::text))
        OR upper(btrim(l.display_name)) = upper(btrim($2::text)))
 LIMIT 2`;

const CONTENTS_SQL = `
SELECT bc.sku, bc.qty, bc.min_qty, bc.max_qty, bc.last_counted,
       i.name AS zoho_item_title, sc.product_title AS catalog_product_title,
       (SELECT f.fnsku FROM fba_fnskus f
         WHERE f.organization_id = bc.organization_id AND f.sku = bc.sku AND f.fnsku IS NOT NULL
         ORDER BY f.fnsku LIMIT 1) AS fnsku
  FROM bin_contents bc
  LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('bc')}
  LEFT JOIN items i ON i.zoho_item_id = sc.provider_item_id
                   AND i.organization_id = sc.organization_id AND i.status = 'active'
 WHERE bc.organization_id = $1 AND bc.location_id = $2 AND (bc.qty > 0 OR $3::boolean)
 ORDER BY bc.qty DESC, bc.sku
 LIMIT 200`;

const LPNS_IN_LOCATION_SQL = `
SELECT hu.code, hu.status,
       (SELECT count(*) FROM serial_units su WHERE su.organization_id = $1 AND su.handling_unit_id = hu.id) AS units
  FROM handling_units hu
 WHERE hu.organization_id = $1 AND hu.location_id = $2 AND hu.status <> 'CLOSED'
 ORDER BY hu.code
 LIMIT 50`;

const locationInput = z.object({
  location: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe('The bin / location as typed or scanned: barcode (e.g. C0312300), name (C-03-12-3) or display name.'),
  includeEmpty: z.boolean().default(false).describe('Also list SKUs slotted here at qty 0.'),
});

export const listLocationContents: AssistantToolDef<typeof locationInput> = {
  name: 'list_location_contents',
  description:
    'WHAT IS IN a bin / shelf location: every SKU with its quantity, plus LPNs parked there. Use for "what\'s in bin C-03-12-3", "contents of location …", a scanned bin barcode. Shows the contents table to the operator itself.',
  permission: 'sku_stock.view',
  inputSchema: locationInput,
  run: async (input, ctx, deps) => {
    const org = ctx.organizationId;
    const value = cleanLocateValue(input.location);
    const { rows: locs } = await deps.query(org, LOCATION_SQL, [org, value]);
    if (locs.length === 0) {
      return { found: false, location: value, searched: ['bin barcode', 'bin name', 'display name'], message: `No active bin or location "${value}" exists in this workspace.` };
    }
    if (locs.length > 1) {
      return {
        found: false,
        ambiguous: true,
        location: value,
        candidates: locs.map((l) => ({ name: str(l.name), barcode: str(l.barcode), room: str(l.room) })),
        message: `"${value}" matches more than one location — ask which barcode they mean.`,
      };
    }
    const loc = locs[0];
    const face = str(loc.location) ?? value;
    const [contents, lpns] = await Promise.all([
      deps.query(org, CONTENTS_SQL, [org, loc.id, input.includeEmpty]),
      deps.query(org, LPNS_IN_LOCATION_SQL, [org, loc.id]),
    ]);
    const items = contents.rows.map((r) => ({
      sku: String(r.sku),
      fnsku: str(r.fnsku),
      title: resolveSkuIdentityTitle({ zoho_item_title: str(r.zoho_item_title), catalog_product_title: str(r.catalog_product_title), sku: String(r.sku) }),
      qty: num(r.qty) ?? 0,
      min: num(r.min_qty),
      max: num(r.max_qty),
      lastCounted: day(r.last_counted),
    }));
    const units = lpns.rows.map((r) => ({ code: String(r.code), status: str(r.status), units: num(r.units) ?? 0 }));

    if (items.length === 0 && units.length === 0) {
      return {
        found: true,
        empty: true,
        location: face,
        barcode: str(loc.barcode),
        room: str(loc.room),
        message: `Bin ${face}${str(loc.room) ? ` (${str(loc.room)})` : ''} is empty — no stock and no LPNs. No table was shown.`,
      };
    }

    const artifact: ArtifactTable = {
      kind: 'table',
      title: `Bin ${face}${str(loc.room) ? ` · ${str(loc.room)}` : ''}`.slice(0, 120),
      columns: [
        'SKU',
        'Qty',
        ...(['Min', 'Max', 'Last counted'] as const).filter((col) =>
          items.some((i) => (col === 'Min' ? i.min : col === 'Max' ? i.max : i.lastCounted) !== null),
        ),
        'Title',
      ],
      rows: [
        ...items.map((i) => ({ SKU: i.sku, Title: i.title, Qty: i.qty, Min: i.min, Max: i.max, 'Last counted': i.lastCounted })),
        ...units.map((u) => ({ SKU: u.code, Title: `LPN · ${u.status ?? 'open'} · ${plural(u.units, 'unit')}`, Qty: u.units, Min: null, Max: null, 'Last counted': null })),
      ].slice(0, 200),
      entityHint: 'SKU',
      idColumn: 'SKU',
      // One loose SKU and nothing else → the answer is about that product;
      // otherwise the bin itself is the subject of the header.
      product:
        items.length === 1 && units.length === 0
          ? {
              title: items[0].title.slice(0, 120),
              ids: [
                { label: 'SKU', value: items[0].sku },
                ...(items[0].fnsku ? [{ label: 'FNSKU' as const, value: items[0].fnsku }] : []),
                { label: 'Bin', value: face },
              ],
            }
          : { title: `Bin ${face}${str(loc.room) ? ` · ${str(loc.room)}` : ''}`.slice(0, 120), ids: [{ label: 'Bin', value: face }] },
    };
    const total = items.reduce((s, i) => s + i.qty, 0);
    const skuText = items.slice(0, 10).map((i) => `${i.sku}: ${i.qty}`).join('; ');
    const titleText = items.slice(0, 10).map((i) => `${i.sku} = ${i.title}`).join('; ');
    const more = items.length > 10 ? ` (+${items.length - 10} more SKUs in the table)` : '';
    const lpnText = units.length > 0 ? ` LPNs here: ${units.map((u) => `${u.code} (${plural(u.units, 'unit')})`).join(', ')}.` : '';
    return envelope(
      'list_location_contents',
      artifact,
      `Bin ${face}${str(loc.room) ? ` in ${str(loc.room)}` : ''} holds ${plural(items.length, 'SKU')}, ${total} units: ${skuText || 'no loose stock'}${more}.${lpnText} The contents table is already on screen — do not render it again.${titleText ? ` Product titles, for your understanding only (already shown; never write them in the answer): ${titleText}.` : ''}`,
    );
  },
};
