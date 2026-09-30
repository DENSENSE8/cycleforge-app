import { NextRequest, NextResponse } from 'next/server';
import { readTimeline } from '@/lib/inventory/events';
import { requireRoutePerm } from '@/lib/auth/dynamic-route-guard';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { listPhotosForEntity } from '@/lib/photos/service';
import { resolveCurrentReceivingLineIds } from '@/lib/neon/serial-units-queries';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { productImageUrl } from '@/lib/photos/product-image-url';

/** GET /api/serial-units/:id Returns one serial_units row (the unit's lifecycle state) plus a recent timeline of inventory_events for that… */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireRoutePerm(request, 'sku_stock.view');
  if (gate.denied) return gate.denied;
  const orgId = gate.ctx.organizationId as OrgId;
  try {
    const { id: idRaw } = await params;
    const raw = decodeURIComponent(idRaw || '').trim();
    if (!raw) {
      return NextResponse.json(
        { success: false, error: 'serial unit id or serial number required' },
        { status: 400 },
      );
    }

    // Phase 3: origin_source / origin_receiving_line_id come from the reconstruction view (single-row lookups below, so the join is cheap).
    const SELECT_COLS = `su.id, su.serial_number, su.normalized_serial, su.sku, su.sku_catalog_id,
                su.unit_uid,
                su.zoho_item_id, su.current_status::text AS current_status,
                su.current_location, su.condition_grade::text AS condition_grade,
                vo.origin_source, vo.origin_receiving_line_id,
                su.received_at, su.received_by,
                su.created_at, su.updated_at`;
    const SELECT_FROM = `FROM serial_units su JOIN v_serial_unit_origins vo ON vo.serial_unit_id = su.id`;

    // Resolve in order: numeric id → normalized serial → minted unit_uid.
    // The unit_uid branch is what makes a scanned products-label QR resolve
    // instead of 404'ing (the QR carries the bare unit id, not the serial).
    let unit: Record<string, unknown> | null = null;
    if (/^\d+$/.test(raw)) {
      const r = await tenantQuery(
        orgId,
        `SELECT ${SELECT_COLS} ${SELECT_FROM} WHERE su.id = $1 AND su.organization_id = $2 LIMIT 1`,
        [Number(raw), orgId],
      );
      unit = r.rows[0] ?? null;
    }
    if (!unit) {
      const r = await tenantQuery(
        orgId,
        `SELECT ${SELECT_COLS} ${SELECT_FROM} WHERE su.normalized_serial = UPPER(TRIM($1)) AND su.organization_id = $2 LIMIT 1`,
        [raw, orgId],
      );
      unit = r.rows[0] ?? null;
    }
    if (!unit) {
      const r = await tenantQuery(
        orgId,
        `SELECT ${SELECT_COLS} ${SELECT_FROM} WHERE su.unit_uid = $1 AND su.organization_id = $2 LIMIT 1`,
        [raw, orgId],
      );
      unit = r.rows[0] ?? null;
    }

    // Print fallback (opt-in via ?orPrint=1):
    if (!unit && request.nextUrl.searchParams.get('orPrint') === '1') {
      const printView = await buildPrintFallback(raw, orgId);
      if (printView) return NextResponse.json(printView);
    }

    if (!unit) {
      return NextResponse.json(
        { success: false, error: 'Serial unit not found' },
        { status: 404 },
      );
    }

    const events = await readTimeline({
      serial_unit_id: Number(unit.id),
      limit: 50,
    }, orgId);

    // The line this unit is CURRENTLY on — origin_receiving_line_id freezes to the FIRST-ever receiving line (upsertSerialUnit COALESCEs it)…
    const currentLineMap = await resolveCurrentReceivingLineIds([Number(unit.id)], orgId);
    const currentReceivingLineId = currentLineMap.get(Number(unit.id)) ?? null;
    // Its carton — the claim a failed QC files is keyed on the carton + line — and the line's filed ticket and QC tester.
    const currentLine =
      currentReceivingLineId == null
        ? null
        : ((
            await tenantQuery<{ receiving_id: number | null; zendesk_ticket: string | null; assigned_tech_id: number | null }>(
              orgId,
              `SELECT rl.receiving_id, NULLIF(BTRIM(rl.zendesk_ticket), '') AS zendesk_ticket, rlt.assigned_tech_id
                 FROM receiving_line rl
                 LEFT JOIN receiving_line_testing rlt
                   ON rlt.receiving_line_id = rl.id AND rlt.organization_id = rl.organization_id
                WHERE rl.id = $1 AND rl.organization_id = $2 LIMIT 1`,
              [currentReceivingLineId, orgId],
            )
          ).rows[0] ?? null);
    const currentReceivingId = currentLine?.receiving_id ?? null;

    // Product title (SKU identity law) and photo + receiver name for display.
    const product = await resolveUnitProduct(orgId, {
      zohoItemId: (unit.zoho_item_id as string | null) ?? null,
      skuCatalogId: unit.sku_catalog_id != null ? Number(unit.sku_catalog_id) : null,
      sku: (unit.sku as string | null) ?? null,
    });

    let receivedByName: string | null = null;
    if (unit.received_by != null) {
      const r = await tenantQuery<{ name: string | null }>(
        orgId,
        `SELECT name FROM staff WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [unit.received_by, orgId],
      );
      receivedByName = r.rows[0]?.name ?? null;
    }

    // Optional rich detail — events timeline (full, oldest-first), condition history, allocations, and tsn cross-refs.
    const includeFull = request.nextUrl.searchParams.get('include') === 'full';
    let fullDetail: {
      events_full: unknown[];
      conditions: unknown[];
      allocations: unknown[];
      tsn_links: unknown[];
      location_detail: Record<string, unknown> | null;
      stock: Record<string, unknown> | null;
      photos: unknown[];
    } | null = null;

    if (includeFull) {
      const unitId = Number(unit.id);
      const locationName =
        typeof unit.current_location === 'string' && unit.current_location.trim()
          ? unit.current_location.trim()
          : null;
      const [eventsFull, conditions, allocations, tsnLinks, locationDetail, stock, unitPhotos] = await Promise.all([
        tenantQuery(
            orgId,
            `SELECT ie.id, ie.occurred_at, ie.event_type, ie.station,
                    ie.prev_status, ie.next_status,
                    ie.bin_id, l.name AS bin_name,
                    ie.stock_ledger_id,
                    ie.actor_staff_id, s.name AS actor_name,
                    ie.scan_token, ie.client_event_id,
                    ie.notes, ie.payload
               FROM inventory_events ie
               LEFT JOIN staff s ON s.id = ie.actor_staff_id
               LEFT JOIN locations l ON l.id = ie.bin_id
              WHERE ie.serial_unit_id = $1 AND ie.organization_id = $2
              ORDER BY ie.occurred_at ASC, ie.id ASC`,
            [unitId, orgId],
          )
          .then((r) => r.rows)
          .catch(() => [] as unknown[]),
        tenantQuery(
            orgId,
            `SELECT h.id, h.assessed_at,
                    h.assessed_by_staff_id, s.name AS assessed_by_name,
                    h.prev_grade::text AS prev_grade,
                    h.new_grade::text AS new_grade,
                    h.cosmetic_notes, h.functional_notes,
                    h.inventory_event_id
               FROM serial_unit_condition_history h
               LEFT JOIN staff s ON s.id = h.assessed_by_staff_id
              WHERE h.serial_unit_id = $1 AND h.organization_id = $2
              ORDER BY h.assessed_at ASC, h.id ASC`,
            [unitId, orgId],
          )
          .then((r) => r.rows)
          .catch(() => [] as unknown[]),
        tenantQuery(
            orgId,
            `SELECT a.id, a.order_id, o.order_id AS order_number, a.allocated_at,
                    a.state::text AS state,
                    a.released_at, a.released_reason,
                    s.name AS allocated_by_name
               FROM order_unit_allocations a
               LEFT JOIN orders o ON o.id = a.order_id AND o.organization_id = a.organization_id
               LEFT JOIN staff s ON s.id = a.allocated_by_staff_id
              WHERE a.serial_unit_id = $1 AND a.organization_id = $2
              ORDER BY a.allocated_at DESC, a.id DESC`,
            [unitId, orgId],
          )
          .then((r) => r.rows)
          .catch(() => [] as unknown[]),
        tenantQuery(
            orgId,
            `SELECT tsn.id, tsn.station_source, tsn.shipment_id,
                    tsn.serial_type, tsn.fnsku,
                    s.name AS tested_by_name, tsn.created_at
               FROM tech_serial_numbers tsn
               LEFT JOIN staff s ON s.id = tsn.tested_by
              WHERE tsn.serial_unit_id = $1 AND tsn.organization_id = $2
              ORDER BY tsn.created_at ASC, tsn.id ASC`,
            [unitId, orgId],
          )
          .then((r) => r.rows)
          .catch(() => [] as unknown[]),
        // Resolve the denormalized `current_location` string back to its full bin row (room / zone / type) so the detail pane can show a rich…
        locationName
          ? tenantQuery(
                orgId,
                `SELECT id, name, room, zone_letter, bin_type, barcode
                   FROM locations WHERE name = $1 AND organization_id = $2 LIMIT 1`,
                [locationName, orgId],
              )
              .then((r) => r.rows[0] ?? null)
              .catch(() => null)
          : Promise.resolve(null),
        // SKU-level inventory snapshot (loose + boxed on-hand) for the
        // inventory-linkage popover. Keyed by the unit's sku.
        unit.sku
          ? tenantQuery(
                orgId,
                `SELECT stock, boxed_stock, product_title
                   FROM sku_stock WHERE sku = $1 AND organization_id = $2 LIMIT 1`,
                [unit.sku, orgId],
              )
              .then((r) => r.rows[0] ?? null)
              .catch(() => null)
          : Promise.resolve(null),
        // Photos captured against THIS unit (entity_type='SERIAL_UNIT') — the
        // packer's scan-the-QR + take-photos set. Surfaced so the detail panel
        // can render them alongside the timeline (one screen, full evidence).
        listPhotosForEntity({
          organizationId: orgId,
          entityType: 'SERIAL_UNIT',
          entityId: unitId,
        })
          .then((rows) =>
            rows.map((row) => ({
              id: row.id,
              url: row.url,
              photo_type: row.photoType,
              uploaded_by: row.takenByStaffId,
              created_at: row.createdAt,
            })),
          )
          .catch(() => [] as unknown[]),
      ]);
      fullDetail = {
        events_full: eventsFull,
        conditions,
        allocations,
        tsn_links: tsnLinks,
        location_detail: (locationDetail as Record<string, unknown> | null) ?? null,
        stock: (stock as Record<string, unknown> | null) ?? null,
        photos: unitPhotos,
      };
    }

    return NextResponse.json({
      success: true,
      serial_unit: {
        ...unit,
        current_receiving_line_id: currentReceivingLineId,
        current_receiving_id: currentReceivingId == null ? null : Number(currentReceivingId),
        current_line_ticket: currentLine?.zendesk_ticket ?? null,
        current_line_tech_id: currentLine?.assigned_tech_id ?? null,
        product_title: product.title,
        product_image_url: product.imageUrl,
        received_by_name: receivedByName,
      },
      events,
      ...(fullDetail ?? {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load serial unit';
    console.error('serial-units/[id] GET failed:', error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * Build a read-only unit view from the most recent LABEL_PRINTED log whose
 * metadata.unit_id matches `unitId`. Used when no serial_units row exists for
 * a printed products label. Returns null when there's no matching print.
 */
async function buildPrintFallback(unitId: string, orgId: OrgId) {
  const sal = await tenantQuery<{
    id: number;
    staff_id: number | null;
    created_at: string;
    metadata: Record<string, unknown>;
  }>(
    orgId,
    `SELECT id, staff_id, created_at, metadata
       FROM station_activity_logs
      WHERE activity_type = 'LABEL_PRINTED'
        AND metadata->>'unit_id' = $1
        AND organization_id = $2
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [unitId, orgId],
  );
  const row = sal.rows[0];
  if (!row) return null;

  const md = row.metadata ?? {};
  const sku = (md.sku as string) ?? null;
  const skuCatalogId =
    md.sku_catalog_id != null && Number.isFinite(Number(md.sku_catalog_id))
      ? Number(md.sku_catalog_id)
      : null;
  const condition = (md.condition as string) ?? null;

  const [stock, staffRow, tsn, invEvent] = await Promise.all([
    sku
      ? tenantQuery<{ stock: number; boxed_stock: number; product_title: string | null; location: string | null }>(
            orgId,
            `SELECT stock, boxed_stock, product_title, location FROM sku_stock WHERE sku = $1 AND organization_id = $2 LIMIT 1`,
            [sku, orgId],
          )
          .then((r) => r.rows[0] ?? null)
          .catch(() => null)
      : Promise.resolve(null),
    row.staff_id != null
      ? tenantQuery<{ name: string | null }>(orgId, `SELECT name FROM staff WHERE id = $1 AND organization_id = $2 LIMIT 1`, [row.staff_id, orgId])
          .then((r) => r.rows[0]?.name ?? null)
          .catch(() => null)
      : Promise.resolve(null),
    // The serial actually LINKED to this printed label, via the SKU↔serial
    // lineage (tech_serial_numbers.context_station_activity_log_id).
    tenantQuery<{ serial_number: string | null; serial_unit_id: number | null }>(
        orgId,
        `SELECT serial_number, serial_unit_id
           FROM tech_serial_numbers
          WHERE context_station_activity_log_id = $1
            AND organization_id = $2
          ORDER BY id ASC
          LIMIT 1`,
        [row.id, orgId],
      )
      .then((r) => r.rows[0] ?? null)
      .catch(() => null),
    // Authoritative QR→unit link:
    tenantQuery<{ serial_unit_id: number | null }>(
        orgId,
        `SELECT serial_unit_id
           FROM inventory_events
          WHERE serial_unit_id IS NOT NULL
            AND (payload->>'unit_id' = $1 OR scan_token = $1)
            AND organization_id = $2
          ORDER BY occurred_at DESC, id DESC
          LIMIT 1`,
        [unitId, orgId],
      )
      .then((r) => r.rows[0] ?? null)
      .catch(() => null),
  ]);

  // Resolve the linked serial_units row — prefer the tech-serial lineage, then
  // the LABELED event's serial_unit_id. That row holds the REAL device serial.
  const resolvedSerialUnitId = tsn?.serial_unit_id ?? invEvent?.serial_unit_id ?? null;
  const liveUnit = resolvedSerialUnitId
    ? await tenantQuery<{
          id: number;
          serial_number: string | null;
          unit_uid: string | null;
          current_status: string;
          current_location: string | null;
          condition_grade: string | null;
          received_at: string | null;
          received_by: number | null;
          zoho_item_id: string | null;
        }>(
          orgId,
          `SELECT id, serial_number, unit_uid, current_status::text AS current_status,
                  current_location, condition_grade::text AS condition_grade,
                  received_at, received_by, zoho_item_id
             FROM serial_units WHERE id = $1 AND organization_id = $2 LIMIT 1`,
          [resolvedSerialUnitId, orgId],
        )
        .then((r) => r.rows[0] ?? null)
        .catch(() => null)
    : null;
  // The device serial: tech-serial string → linked unit's serial → unit id.
  const linkedSerial = tsn?.serial_number?.trim() || liveUnit?.serial_number?.trim() || null;

  // SKU-level stock location is the best "where do these live" for an
  // unstocked printed label — resolve it to a full bin row when known.
  const locationName = stock?.location?.trim() || null;
  const locationDetail = locationName
    ? await tenantQuery(
          orgId,
          `SELECT id, name, room, zone_letter, bin_type, barcode FROM locations WHERE name = $1 AND organization_id = $2 LIMIT 1`,
          [locationName, orgId],
        )
        .then((r) => r.rows[0] ?? null)
        .catch(() => null)
    : null;

  const product = await resolveUnitProduct(orgId, {
    zohoItemId: liveUnit?.zoho_item_id ?? null,
    skuCatalogId,
    sku,
  });
  // Serial = the serial linked to the QR label (tech_serial_numbers), falling
  // back to the minted unit id for auto-issue labels that reuse it as serial.
  const serial = linkedSerial ?? unitId;
  const serialUnit = {
    id: liveUnit?.id ?? 0,
    serial_number: serial,
    normalized_serial: serial.toUpperCase(),
    unit_uid: unitId,
    sku,
    sku_catalog_id: skuCatalogId,
    current_status: liveUnit?.current_status ?? 'LABELED',
    current_location: liveUnit?.current_location ?? locationName,
    condition_grade: liveUnit?.condition_grade ?? condition,
    origin_source: 'label_print',
    origin_receiving_line_id: null,
    current_receiving_line_id: null,
    current_receiving_id: null,
    current_line_ticket: null,
    current_line_tech_id: null,
    received_at: liveUnit?.received_at ?? row.created_at,
    received_by: liveUnit?.received_by ?? row.staff_id,
    received_by_name: staffRow,
    product_title: product.title,
    product_image_url: product.imageUrl,
    created_at: row.created_at,
    updated_at: row.created_at,
  };

  // One synthetic timeline entry for the print itself.
  const events = [
    {
      id: row.id,
      occurred_at: row.created_at,
      event_type: 'LABELED',
      station: 'LABELS',
      prev_status: null,
      next_status: 'LABELED',
      bin_id: null,
      bin_name: null,
      actor_staff_id: row.staff_id,
      actor_name: staffRow,
      scan_token: null,
      notes: null,
      payload: { print_class: md.print_class ?? null, gtin: md.gtin ?? null },
    },
  ];

  return {
    success: true,
    source: 'print',
    serial_unit: serialUnit,
    events,
    events_full: events,
    conditions: [],
    allocations: [],
    tsn_links: [],
    photos: [],
    location_detail: locationDetail,
    stock: stock
      ? { stock: stock.stock, boxed_stock: stock.boxed_stock, product_title: stock.product_title }
      : null,
  };
}

/** The unit's product title under the SKU identity law, and its photo under the one product-photo rule. */
async function resolveUnitProduct(
  orgId: OrgId,
  ref: { zohoItemId: string | null; skuCatalogId: number | null; sku: string | null },
): Promise<{ title: string | null; imageUrl: string | null }> {
  if (!ref.zohoItemId && ref.skuCatalogId == null && !ref.sku) return { title: null, imageUrl: null };
  const r = await tenantQuery<{
    zoho_item_title: string | null;
    zoho_image_document_id: string | null;
    catalog_product_title: string | null;
    catalog_image_url: string | null;
    listing_cover_photo_id: number | null;
    item_name: string | null;
  }>(
    orgId,
    `SELECT
       (SELECT name FROM items
         WHERE zoho_item_id = $1 AND organization_id = $4 AND status = 'active'
         LIMIT 1) AS zoho_item_title,
       (SELECT image_document_id FROM items
         WHERE zoho_item_id = $1 AND organization_id = $4 AND status = 'active'
         LIMIT 1) AS zoho_image_document_id,
       (SELECT product_title FROM sku_catalog
         WHERE id = $2 AND organization_id = $4
         LIMIT 1) AS catalog_product_title,
       (SELECT image_url FROM sku_catalog
         WHERE id = $2 AND organization_id = $4
         LIMIT 1) AS catalog_image_url,
       (SELECT photo_id FROM listing_photos
         WHERE sku_catalog_id = $2 AND organization_id = $4 AND is_cover
         LIMIT 1) AS listing_cover_photo_id,
       (SELECT product_title FROM sku_stock
         WHERE sku = $3 AND organization_id = $4
         LIMIT 1) AS item_name`,
    [ref.zohoItemId, ref.skuCatalogId, ref.sku, orgId],
  );
  const row = r.rows[0];
  return {
    title: resolveSkuIdentityTitle(row ?? {}) || null,
    imageUrl: row
      ? productImageUrl({
          catalogImageUrl: row.catalog_image_url,
          listingCoverPhotoId: row.listing_cover_photo_id,
          zohoItemId: ref.zohoItemId,
          zohoImageDocumentId: row.zoho_image_document_id,
        })
      : null,
  };
}
