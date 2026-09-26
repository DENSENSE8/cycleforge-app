/** GET /api/receiving-lines/incoming/details?po_id=<zoho_purchaseorder_id> optional: */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { tenantQuery } from '@/lib/tenancy/db';
import { readInventorySpine, type InventoryEventRecord } from '@/lib/audit-log/inventory-spine';
import { isRegisteredInboundSource, INBOUND_SOURCE_FACT_KIND, type InboundSourceType } from '@/lib/inbound/source-registry';
import { getOrSet, createCacheLookupKey } from '@/lib/cache/upstash-cache';
import { CACHE_NS, CACHE_TAGS, CACHE_TTL } from '@/lib/cache/tags';

export const dynamic = 'force-dynamic';

export const GET = withAuth(async (req: NextRequest, ctx) => {
  const orgId = ctx.organizationId;
  const url = new URL(req.url);
  const poId = (url.searchParams.get('po_id') || '').trim();
  const shipmentIdParam = (url.searchParams.get('shipment_id') || '').trim();
  const focusReceivingParam = (url.searchParams.get('receiving_id') || '').trim();
  const focusReceivingId = (() => {
    const n = Number(focusReceivingParam);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  // ── Shipment-anchored fallback (no resolved PO) ───────────────────────── A "Delivered · not scanned" box whose tracking# never resolved…
  if (!poId && shipmentIdParam) {
    const sid = Number(shipmentIdParam);
    if (!Number.isFinite(sid) || sid <= 0) {
      return NextResponse.json({ success: false, error: 'valid shipment_id required' }, { status: 400 });
    }
    // shipping_tracking_numbers has no organization_id column yet (NEEDS-COL):
    // run GUC-wrapped via tenantQuery (RLS backstop) — no explicit org filter
    // is possible until the column lands.
    const stnRes = await tenantQuery<{
      id: number;
      tracking_number_raw: string | null;
      carrier: string | null;
      latest_status_category: string | null;
      is_delivered: boolean | null;
      delivered_at: string | null;
      last_checked_at: string | null;
      out_for_delivery_at: string | null;
    }>(
      orgId,
      `SELECT id, tracking_number_raw, carrier, latest_status_category, is_delivered,
                delivered_at::text, last_checked_at::text, out_for_delivery_at::text
           FROM shipping_tracking_numbers
          WHERE id = $1
          LIMIT 1`,
      [sid],
    );
    const stn = stnRes.rows[0] ?? null;
    if (!stn) {
      return NextResponse.json({ success: false, error: 'shipment not found' }, { status: 404 });
    }
    // Wave-2 reader cutover: the carton's door-received stamp reads from the
    // receiving_triage street table (rt.door_received_at, 1:1 with the
    // carton); output alias stays `received_at` so the response is unchanged.
    const recvRes = await tenantQuery<{ id: number; support_notes: string | null; received_at: string | null }>(
      orgId,
      `SELECT r.id, r.support_notes, rt.door_received_at::text AS received_at
           FROM receiving_carton r
           LEFT JOIN receiving_triage rt
             ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
          WHERE r.shipment_id = $1
            AND r.organization_id = $2
          ORDER BY r.id
          LIMIT 1`,
      [sid, orgId],
    );
    const recv = recvRes.rows[0] ?? null;
    // shipment_tracking_events has no organization_id column yet (NEEDS-COL):
    // GUC-wrapped only, scoped by the shipment id (whose owning receiving row
    // was already org-checked above).
    const ev = await tenantQuery(
      orgId,
      `SELECT id, event_occurred_at::text, normalized_status_category,
                external_status_label, external_status_description,
                event_city, event_state, exception_description, signed_by
           FROM shipment_tracking_events
          WHERE shipment_id = $1
          ORDER BY event_occurred_at DESC NULLS LAST, id DESC
          LIMIT 25`,
      [sid],
    );
    return NextResponse.json({
      success: true,
      po: null,
      receiving: recv ? { id: recv.id, shipment_id: sid, received_at: recv.received_at } : null,
      line_items: [],
      shipment: {
        shipment_id: sid,
        tracking_number: stn.tracking_number_raw,
        carrier: stn.carrier,
        latest_status_category: stn.latest_status_category,
        is_delivered: stn.is_delivered,
        delivered_at: stn.delivered_at,
        last_checked_at: stn.last_checked_at,
        out_for_delivery_at: stn.out_for_delivery_at,
        events: ev.rows,
      },
      receive_events: [],
      gmail: [],
      delivered_emails: [],
      zoho_activity: [],
      po_notes: null,
      notes: recv?.support_notes ?? null,
    });
  }

  // ── Inbound-anchored branch (eBay / marketplace, plan §7.3) ───────────── A non-Zoho Incoming row (e.g.
  const inboundSource = (url.searchParams.get('inbound_source') || '').trim().toLowerCase();
  const inboundOrderId = (url.searchParams.get('inbound_order_id') || '').trim();
  if (!poId && inboundSource && inboundOrderId) {
    if (!isRegisteredInboundSource(inboundSource)) {
      return NextResponse.json({ success: false, error: 'unknown inbound source' }, { status: 400 });
    }

    // Spine lines for this external order (one order can span multiple lines).
    const linesRes = await tenantQuery<{
      id: number;
      sku: string | null;
      item_name: string | null;
      quantity_expected: number;
      quantity_received: number;
      workflow_status: string | null;
      zoho_purchaseorder_id: string | null;
      zoho_purchaseorder_number: string | null;
      platform_account_id: number | null;
      receiving_id: number | null;
      listing_url: string | null;
    }>(
      orgId,
      `SELECT rl.id, rl.sku, rl.item_name, rl.quantity_expected, rl.quantity_received,
                rl.workflow_status::text AS workflow_status,
                -- Wave-2 reader cutover: line zoho cluster reads from
                -- receiving_line_zoho rz (1:1; LEFT JOIN ≡ the old spine NULLs).
                rz.zoho_purchaseorder_id, rz.zoho_purchaseorder_number,
                rl.platform_account_id, rl.receiving_id, rl.listing_url
           FROM inbound_purchase_order_links l
           JOIN receiving_line rl ON rl.id = l.receiving_line_id AND rl.organization_id = l.organization_id
           LEFT JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
          WHERE l.organization_id = $1 AND l.source_type = $2 AND l.source_order_id = $3
          ORDER BY l.is_primary DESC, rl.id
          LIMIT 200`,
      [orgId, inboundSource, inboundOrderId],
    );
    const spineLines = linesRes.rows;
    if (spineLines.length === 0) {
      return NextResponse.json({ success: false, error: 'inbound order not found' }, { status: 404 });
    }
    const primaryLine = spineLines[0];

    // All purchase-identity links across this order's lines (shows the merged
    // Zoho PO when one exists).
    const lineIdList = spineLines.map((l) => l.id);
    const allLinksRes = await tenantQuery<{
      source_type: string; source_order_id: string; is_primary: boolean;
    }>(
      orgId,
      `SELECT DISTINCT source_type, source_order_id, bool_or(is_primary) AS is_primary
           FROM inbound_purchase_order_links
          WHERE organization_id = $1 AND receiving_line_id = ANY($2::int[])
          GROUP BY source_type, source_order_id
          ORDER BY is_primary DESC`,
      [orgId, lineIdList],
    );

    // Reconcile mirror snapshot (seller/status/tracking).
    const mirrorRes = await tenantQuery<{
      order_number: string | null; vendor_or_seller_name: string | null;
      status: string | null; payment_status: string | null;
      tracking_number: string | null; carrier_code: string | null;
      po_date: string | null; expected_delivery_date: string | null;
      raw_payload: Record<string, unknown> | null;
    }>(
      orgId,
      `SELECT order_number, vendor_or_seller_name, status, payment_status,
                tracking_number, carrier_code, po_date::text, expected_delivery_date::text,
                raw_payload
           FROM inbound_purchase_order_mirror
          WHERE organization_id = $1 AND source_type = $2 AND source_order_id = $3
          LIMIT 1`,
      [orgId, inboundSource, inboundOrderId],
    );
    const mirror = mirrorRes.rows[0] ?? null;

    // Marketplace payload facts (e.g. ebay_purchase: seller, listing url, status).
    const factKind = INBOUND_SOURCE_FACT_KIND[inboundSource as InboundSourceType];
    let facts: Record<string, unknown> | null = null;
    if (factKind) {
      const factsRes = await tenantQuery<{ payload: Record<string, unknown> }>(
        orgId,
        `SELECT payload FROM receiving_line_facts
            WHERE organization_id = $1 AND receiving_line_id = $2 AND fact_kind = $3
            LIMIT 1`,
        [orgId, primaryLine.id, factKind],
      );
      facts = factsRes.rows[0]?.payload ?? null;
    }

    // Buyer/storefront account label.
    let accountLabel: string | null = null;
    if (primaryLine.platform_account_id != null) {
      const acctRes = await tenantQuery<{ label: string | null; integration_scope: string | null }>(
        orgId,
        `SELECT label, integration_scope FROM platform_accounts
            WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [primaryLine.platform_account_id, orgId],
      );
      accountLabel = acctRes.rows[0]?.label ?? acctRes.rows[0]?.integration_scope ?? null;
    }

    // Lifecycle history for the order's lines.
    let inboundEvents: InventoryEventRecord[] = [];
    try {
      inboundEvents = await readInventorySpine({ lineIds: lineIdList, order: 'desc', limit: 50 }, orgId);
    } catch (err) {
      console.warn('details(inbound): readInventorySpine failed', err);
    }

    const zohoLink = allLinksRes.rows.find((l) => l.source_type === 'zoho') ?? null;

    return NextResponse.json({
      success: true,
      po: null,
      inbound: {
        source_type: inboundSource,
        source_order_id: inboundOrderId,
        order_number: mirror?.order_number ?? inboundOrderId,
        seller_name: mirror?.vendor_or_seller_name ?? (facts?.sellerUsername as string | null) ?? null,
        status: mirror?.status ?? (facts?.purchaseOrderStatus as string | null) ?? null,
        payment_status: mirror?.payment_status ?? (facts?.paymentStatus as string | null) ?? null,
        listing_url:
          (facts?.listingUrl as string | null)
          ?? (typeof mirror?.raw_payload?.listingUrl === 'string'
            ? mirror.raw_payload.listingUrl
            : null),
        tracking_number: mirror?.tracking_number ?? null,
        account_label: accountLabel,
        receiving_line_id: primaryLine.id,
        zoho_purchaseorder_id: zohoLink?.source_order_id ?? primaryLine.zoho_purchaseorder_id ?? null,
        links: allLinksRes.rows.map((l) => ({
          source_type: l.source_type,
          source_order_id: l.source_order_id,
          is_primary: l.is_primary,
        })),
      },
      receiving: primaryLine.receiving_id ? { id: primaryLine.receiving_id, shipment_id: null, received_at: null } : null,
      line_items: spineLines.map((l) => ({
        line_item_id: null,
        item_id: null,
        sku: l.sku,
        name: l.item_name,
        description: null,
        quantity_expected: Number(l.quantity_expected ?? 0),
        quantity_received: Number(l.quantity_received ?? 0),
        workflow_status: l.workflow_status,
        receiving_line_id: l.id,
        rate: null,
        item_total: null,
        listing_url: l.listing_url,
      })),
      shipment: mirror?.tracking_number
        ? {
            shipment_id: 0,
            tracking_number: mirror.tracking_number,
            carrier: mirror.carrier_code,
            latest_status_category: null,
            is_delivered: null,
            delivered_at: null,
            last_checked_at: null,
            out_for_delivery_at: null,
            events: [],
          }
        : null,
      receive_events: inboundEvents.map((e) => ({
        id: e.id,
        occurred_at: e.occurred_at,
        event_type: e.event_type,
        actor_staff_id: e.actor_staff_id,
        actor_name: e.actor_name,
        station: e.station,
        sku: e.sku,
        serial_number: e.serial_number,
        serial_unit_id: e.serial_unit_id,
        prev_status: e.prev_status,
        next_status: e.next_status,
        notes: e.notes,
      })),
      gmail: [],
      delivered_emails: [],
      zoho_activity: [],
      po_notes: null,
      notes: null,
    });
  }

  // ── Carton-anchored unpaired (no PO / shipment param / inbound) ─────────
  // Dash-Order Incoming rows that already have a receiving carton (door-scanned
  // unfound) open the inspector for Package Pairing. Key on receiving_id alone.
  if (!poId && focusReceivingId) {
    const cartonRes = await tenantQuery<{
      id: number;
      shipment_id: number | null;
      support_notes: string | null;
      received_at: string | null;
      zoho_purchaseorder_id: string | null;
      zoho_purchaseorder_number: string | null;
    }>(
      orgId,
      `SELECT r.id, r.shipment_id, r.support_notes,
                rt.door_received_at::text AS received_at,
                r.zoho_purchaseorder_id, r.zoho_purchaseorder_number
           FROM receiving_carton r
           LEFT JOIN receiving_triage rt
             ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
          WHERE r.id = $1
            AND r.organization_id = $2
          LIMIT 1`,
      [focusReceivingId, orgId],
    );
    const carton = cartonRes.rows[0] ?? null;
    if (!carton) {
      return NextResponse.json({ success: false, error: 'carton not found' }, { status: 404 });
    }

    const cartonPoId = (carton.zoho_purchaseorder_id || '').trim();

    let shipment: {
      shipment_id: number;
      tracking_number: string | null;
      carrier: string | null;
      latest_status_category: string | null;
      is_delivered: boolean | null;
      delivered_at: string | null;
      last_checked_at: string | null;
      out_for_delivery_at: string | null;
      events: unknown[];
    } | null = null;

    if (carton.shipment_id != null) {
      const sid = carton.shipment_id;
      const stnRes = await tenantQuery<{
        id: number;
        tracking_number_raw: string | null;
        carrier: string | null;
        latest_status_category: string | null;
        is_delivered: boolean | null;
        delivered_at: string | null;
        last_checked_at: string | null;
        out_for_delivery_at: string | null;
      }>(
        orgId,
        `SELECT id, tracking_number_raw, carrier, latest_status_category, is_delivered,
                  delivered_at::text, last_checked_at::text, out_for_delivery_at::text
             FROM shipping_tracking_numbers
            WHERE id = $1
            LIMIT 1`,
        [sid],
      );
      const stn = stnRes.rows[0] ?? null;
      const ev = stn
        ? await tenantQuery(
            orgId,
            `SELECT id, event_occurred_at::text, normalized_status_category,
                      external_status_label, external_status_description,
                      event_city, event_state, exception_description, signed_by
                 FROM shipment_tracking_events
                WHERE shipment_id = $1
                ORDER BY event_occurred_at DESC NULLS LAST, id DESC
                LIMIT 25`,
            [sid],
          )
        : { rows: [] as unknown[] };
      if (stn) {
        shipment = {
          shipment_id: sid,
          tracking_number: stn.tracking_number_raw,
          carrier: stn.carrier,
          latest_status_category: stn.latest_status_category,
          is_delivered: stn.is_delivered,
          delivered_at: stn.delivered_at,
          last_checked_at: stn.last_checked_at,
          out_for_delivery_at: stn.out_for_delivery_at,
          events: ev.rows,
        };
      }
    }

    const linesRes = await tenantQuery<{
      id: number;
      sku: string | null;
      item_name: string | null;
      quantity_expected: number;
      quantity_received: number;
      workflow_status: string | null;
      zoho_line_item_id: string | null;
      zoho_item_id: string | null;
      rate: number | null;
      listing_url: string | null;
    }>(
      orgId,
      `SELECT rl.id, rl.sku, rl.item_name, rl.quantity_expected, rl.quantity_received,
                rl.workflow_status::text AS workflow_status,
                rz.zoho_line_item_id, rz.zoho_item_id, rz.rate, rl.listing_url
           FROM receiving_line rl
           LEFT JOIN receiving_line_zoho rz
             ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
          WHERE rl.receiving_id = $1
            AND rl.organization_id = $2
          ORDER BY rl.id
          LIMIT 200`,
      [focusReceivingId, orgId],
    );

    // Carton already has a PO — return PO header when present so Pairing can
    // collapse after a successful link without a second open.
    let po: {
      zoho_purchaseorder_id: string;
      zoho_purchaseorder_number: string;
      vendor_id: string | null;
      vendor_name: string | null;
      status: string | null;
      po_date: string | null;
      expected_delivery_date: string | null;
      reference_number: string | null;
      total: string | null;
      currency: string | null;
      last_modified_zoho: string | null;
      last_synced_at: string;
      raw?: Record<string, unknown>;
    } | null = null;
    if (cartonPoId) {
      const mirrorRes = await tenantQuery<{
        zoho_purchaseorder_id: string;
        zoho_purchaseorder_number: string;
        vendor_id: string | null;
        vendor_name: string | null;
        status: string | null;
        po_date: string | null;
        expected_delivery_date: string | null;
        reference_number: string | null;
        total: string | null;
        currency: string | null;
        raw: Record<string, unknown>;
        last_modified_zoho: string | null;
        last_synced_at: string;
      }>(
        orgId,
        `SELECT zoho_purchaseorder_id, zoho_purchaseorder_number, vendor_id, vendor_name,
                  status, po_date::text, expected_delivery_date::text, reference_number, total, currency,
                  raw, last_modified_zoho::text, last_synced_at::text
             FROM zoho_po_mirror
            WHERE zoho_purchaseorder_id = $1
            LIMIT 1`,
        [cartonPoId],
      );
      const mirror = mirrorRes.rows[0] ?? null;
      if (mirror) {
        po = {
          zoho_purchaseorder_id: mirror.zoho_purchaseorder_id,
          zoho_purchaseorder_number: mirror.zoho_purchaseorder_number,
          vendor_id: mirror.vendor_id,
          vendor_name: mirror.vendor_name,
          status: mirror.status,
          po_date: mirror.po_date,
          expected_delivery_date: mirror.expected_delivery_date,
          reference_number: mirror.reference_number,
          total: mirror.total,
          currency: mirror.currency,
          last_modified_zoho: mirror.last_modified_zoho,
          last_synced_at: mirror.last_synced_at,
          raw: mirror.raw,
        };
      } else {
        po = {
          zoho_purchaseorder_id: cartonPoId,
          zoho_purchaseorder_number: carton.zoho_purchaseorder_number || cartonPoId,
          vendor_id: null,
          vendor_name: null,
          status: null,
          po_date: null,
          expected_delivery_date: null,
          reference_number: null,
          total: null,
          currency: null,
          last_modified_zoho: null,
          last_synced_at: '',
        };
      }
    }

    return NextResponse.json({
      success: true,
      po,
      receiving: {
        id: carton.id,
        shipment_id: carton.shipment_id,
        received_at: carton.received_at,
      },
      line_items: linesRes.rows.map((l) => ({
        line_item_id: l.zoho_line_item_id,
        item_id: l.zoho_item_id,
        sku: l.sku,
        name: l.item_name,
        description: null,
        quantity_expected: l.quantity_expected,
        quantity_received: l.quantity_received,
        workflow_status: l.workflow_status,
        receiving_line_id: l.id,
        rate: l.rate,
        item_total: null,
        listing_url: l.listing_url,
      })),
      shipment,
      receive_events: [],
      gmail: [],
      delivered_emails: [],
      zoho_activity: [],
      po_notes: null,
      notes: carton.support_notes ?? null,
    });
  }

  if (!poId) {
    return NextResponse.json(
      {
        success: false,
        error:
          'po_id, shipment_id, inbound_source+inbound_order_id, or receiving_id is required',
      },
      { status: 400 },
    );
  }

  // Cache the dominant PO-anchored detail branch org-scoped (polled 60s per open drawer).
  const payload = await getOrSet(
    CACHE_NS.receivingIncomingDetails,
    orgId,
    createCacheLookupKey({ poId, focusReceivingId }),
    CACHE_TTL.rollup,
    [CACHE_TAGS.receivingLines],
    async () => {
  // ── PO header (zoho_po_mirror) ──────────────────────────────────────────
  // zoho_po_mirror has no organization_id column yet (NEEDS-COL): GUC-wrapped
  // via tenantQuery only — no explicit org filter until the column lands.
  const mirrorRes = await tenantQuery<{
    zoho_purchaseorder_id: string;
    zoho_purchaseorder_number: string;
    vendor_id: string | null;
    vendor_name: string | null;
    status: string | null;
    po_date: string | null;
    expected_delivery_date: string | null;
    reference_number: string | null;
    total: string | null;
    currency: string | null;
    raw: Record<string, unknown>;
    last_modified_zoho: string | null;
    last_synced_at: string;
  }>(
    orgId,
    `SELECT zoho_purchaseorder_id, zoho_purchaseorder_number, vendor_id, vendor_name,
              status, po_date::text, expected_delivery_date::text, reference_number, total, currency,
              raw, last_modified_zoho::text, last_synced_at::text
         FROM zoho_po_mirror
        WHERE zoho_purchaseorder_id = $1
        LIMIT 1`,
    [poId],
  );
  const mirror = mirrorRes.rows[0] ?? null;

  // ── receiving row + shipment + carrier status ──────────────────────────
  // Prefer the Unbox/Triage focus carton when it belongs to this PO (multi-box);
  // otherwise fall back to any zoho_po carton for the PO.
  const recvRes = await tenantQuery<{
    id: number;
    shipment_id: number | null;
    support_notes: string | null;
    zoho_notes: string | null;
    received_at: string | null;
    zoho_purchase_receive_id: string | null;
    inventory_received_at: string | null;
    shipment_tracking_number_raw: string | null;
    shipment_carrier: string | null;
    shipment_status_category: string | null;
    shipment_is_delivered: boolean | null;
    shipment_delivered_at: string | null;
    shipment_last_checked_at: string | null;
    shipment_out_for_delivery_at: string | null;
  }>(
    orgId,
    focusReceivingId != null
      ? `SELECT r.id,
                  r.shipment_id,
                  r.support_notes,
                  r.zoho_notes,
                  rt.door_received_at::text       AS received_at,
                  r.zoho_purchase_receive_id,
                  (
                    SELECT MAX(rl.received_done_at)::text
                      FROM receiving_line rl
                     WHERE rl.receiving_id = r.id
                       AND rl.organization_id = r.organization_id
                  ) AS inventory_received_at,
                  stn.tracking_number_raw         AS shipment_tracking_number_raw,
                  stn.carrier                     AS shipment_carrier,
                  stn.latest_status_category      AS shipment_status_category,
                  stn.is_delivered                AS shipment_is_delivered,
                  stn.delivered_at::text          AS shipment_delivered_at,
                  stn.last_checked_at::text       AS shipment_last_checked_at,
                  stn.out_for_delivery_at::text   AS shipment_out_for_delivery_at
             FROM receiving_carton r
             LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
             LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
            WHERE r.id = $3
              AND r.organization_id = $2
              AND r.source = 'zoho_po'
              AND r.zoho_purchaseorder_id = $1
            LIMIT 1`
      : `SELECT r.id,
                  r.shipment_id,
                  r.support_notes,
                  r.zoho_notes,
                  -- Wave-2 reader cutover: door-received stamp from receiving_triage
                  -- (1:1 street table); alias keeps the response key received_at.
                  rt.door_received_at::text       AS received_at,
                  r.zoho_purchase_receive_id,
                  (
                    SELECT MAX(rl.received_done_at)::text
                      FROM receiving_line rl
                     WHERE rl.receiving_id = r.id
                       AND rl.organization_id = r.organization_id
                  ) AS inventory_received_at,
                  stn.tracking_number_raw         AS shipment_tracking_number_raw,
                  stn.carrier                     AS shipment_carrier,
                  stn.latest_status_category      AS shipment_status_category,
                  stn.is_delivered                AS shipment_is_delivered,
                  stn.delivered_at::text          AS shipment_delivered_at,
                  stn.last_checked_at::text       AS shipment_last_checked_at,
                  stn.out_for_delivery_at::text   AS shipment_out_for_delivery_at
             FROM receiving_carton r
             LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
             LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
            WHERE r.source = 'zoho_po'
              AND r.zoho_purchaseorder_id = $1
              AND r.organization_id = $2
            LIMIT 1`,
    focusReceivingId != null ? [poId, orgId, focusReceivingId] : [poId, orgId],
  );
  let recv = recvRes.rows[0] ?? null;
  // Focus carton missing or not on this PO — fall back to any matching carton.
  if (!recv && focusReceivingId != null) {
    const fallbackRes = await tenantQuery<typeof recvRes.rows[0]>(
      orgId,
      `SELECT r.id,
                r.shipment_id,
                r.support_notes,
                r.zoho_notes,
                rt.door_received_at::text       AS received_at,
                r.zoho_purchase_receive_id,
                (
                  SELECT MAX(rl.received_done_at)::text
                    FROM receiving_line rl
                   WHERE rl.receiving_id = r.id
                     AND rl.organization_id = r.organization_id
                ) AS inventory_received_at,
                stn.tracking_number_raw         AS shipment_tracking_number_raw,
                stn.carrier                     AS shipment_carrier,
                stn.latest_status_category      AS shipment_status_category,
                stn.is_delivered                AS shipment_is_delivered,
                stn.delivered_at::text          AS shipment_delivered_at,
                stn.last_checked_at::text       AS shipment_last_checked_at,
                stn.out_for_delivery_at::text   AS shipment_out_for_delivery_at
           FROM receiving_carton r
           LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
           LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
          WHERE r.source = 'zoho_po'
              AND r.zoho_purchaseorder_id = $1
              AND r.organization_id = $2
          LIMIT 1`,
      [poId, orgId],
    );
    recv = fallbackRes.rows[0] ?? null;
  }

  // ── Shipment events (last 25) ──────────────────────────────────────────
  let shipmentEvents: Array<{
    id: number;
    event_occurred_at: string | null;
    normalized_status_category: string;
    external_status_label: string | null;
    external_status_description: string | null;
    event_city: string | null;
    event_state: string | null;
    exception_description: string | null;
    signed_by: string | null;
  }> = [];
  if (recv?.shipment_id) {
    // shipment_tracking_events has no organization_id column yet (NEEDS-COL):
    // GUC-wrapped only, scoped by the shipment id of the org-checked receiving
    // row above.
    const ev = await tenantQuery(
      orgId,
      `SELECT id,
                event_occurred_at::text,
                normalized_status_category,
                external_status_label,
                external_status_description,
                event_city,
                event_state,
                exception_description,
                signed_by
           FROM shipment_tracking_events
          WHERE shipment_id = $1
          ORDER BY event_occurred_at DESC NULLS LAST, id DESC
          LIMIT 25`,
      [recv.shipment_id],
    );
    shipmentEvents = ev.rows as typeof shipmentEvents;
  }

  // ── Line items:
  type RawLine = {
    line_item_id?: string;
    item_id?: string;
    sku?: string;
    name?: string;
    description?: string;
    quantity?: number;
    rate?: number;
    item_total?: number;
    listing_url?: string;
  };
  type LocalLine = {
    id: number;
    zoho_line_item_id: string | null;
    zoho_item_id: string | null;
    zoho_notes: string | null;
    unit_price: string | null;
    quantity_received: number;
    quantity_expected: number | null;
    workflow_status: string | null;
    sku: string | null;
    item_name: string | null;
    listing_url: string | null;
  };
  const rawLineItems: RawLine[] = (() => {
    const raw = mirror?.raw as { line_items?: RawLine[] } | undefined;
    return Array.isArray(raw?.line_items) ? (raw!.line_items as RawLine[]) : [];
  })();

  const localLinesRes = await tenantQuery<LocalLine>(
    orgId,
    `SELECT rl.id,
              rz.zoho_line_item_id,
              rz.zoho_item_id,
              rz.zoho_notes,
              rz.unit_price::text,
              rl.quantity_received,
              rl.quantity_expected,
              rl.workflow_status::text,
              rl.sku,
              rl.item_name,
              rl.listing_url
         FROM receiving_line_zoho rz
         JOIN receiving_line rl
           ON rl.id = rz.receiving_line_id AND rl.organization_id = rz.organization_id
        WHERE rz.zoho_purchaseorder_id = $1
          AND rz.organization_id = $2
        ORDER BY rl.id
        LIMIT 500`,
    [poId, orgId],
  );
  const localByLineItemId = new Map<
    string,
    LocalLine
  >();
  const localBySku = new Map<string, LocalLine>();
  for (const row of localLinesRes.rows) {
    if (row.zoho_line_item_id) {
      localByLineItemId.set(row.zoho_line_item_id, row);
    }
    const skuKey = (row.sku || '').trim().toLowerCase();
    if (skuKey && !localBySku.has(skuKey)) {
      localBySku.set(skuKey, row);
    }
  }

  const line_items =
    rawLineItems.length > 0
      ? rawLineItems.map((l) => {
          const skuKey = (l.sku || '').trim().toLowerCase();
          const match =
            (l.line_item_id ? localByLineItemId.get(l.line_item_id) : null) ??
            (skuKey ? localBySku.get(skuKey) ?? null : null);
          // Prefer satellite notes (post-receive SN·condition text) over stale
          // mirror description when present.
          const description =
            (match?.zoho_notes ?? '').trim() || (l.description ?? null);
          const rateFromLocal =
            match?.unit_price != null && match.unit_price !== ''
              ? Number(match.unit_price)
              : null;
          return {
            line_item_id: l.line_item_id ?? null,
            item_id: l.item_id ?? match?.zoho_item_id ?? null,
            sku: l.sku ?? match?.sku ?? null,
            name: l.name ?? match?.item_name ?? null,
            description,
            quantity_expected: Number(l.quantity ?? match?.quantity_expected ?? 0),
            quantity_received: match?.quantity_received ?? 0,
            workflow_status: match?.workflow_status ?? null,
            receiving_line_id: match?.id ?? null,
            rate: l.rate ?? rateFromLocal,
            item_total: l.item_total ?? null,
            listing_url: l.listing_url ?? match?.listing_url ?? null,
          };
        })
      : localLinesRes.rows.map((l) => {
          const rate =
            l.unit_price != null && l.unit_price !== '' ? Number(l.unit_price) : null;
          const expected = Number(l.quantity_expected ?? 0);
          return {
            line_item_id: l.zoho_line_item_id,
            item_id: l.zoho_item_id,
            sku: l.sku,
            name: l.item_name,
            description: l.zoho_notes,
            quantity_expected: expected,
            quantity_received: Number(l.quantity_received ?? 0),
            workflow_status: l.workflow_status,
            receiving_line_id: l.id,
            rate: Number.isFinite(rate as number) ? rate : null,
            item_total:
              rate != null && Number.isFinite(rate) && expected > 0
                ? rate * expected
                : null,
            listing_url: l.listing_url,
          };
        });

  // ── Receive / line lifecycle history (inventory_events) ───────────────── Anchor on the PO's receiving_line_ids ("line under PO") AND the…
  const lineIds = line_items
    .map((l) => l.receiving_line_id)
    .filter((n): n is number => Number.isFinite(n as number));
  const cartonIds = recv?.id ? [recv.id] : [];
  let receiveEvents: InventoryEventRecord[] = [];
  if (lineIds.length > 0 || cartonIds.length > 0) {
    try {
      // Thread orgId (Phase A) → GUC-wraps the spine read, pins ie.organization_id, and aligns the staff/serial_units LEFT JOINs so a…
      receiveEvents = await readInventorySpine({ lineIds, cartonIds, order: 'desc', limit: 50 }, orgId);
    } catch (err) {
      console.warn('details: readInventorySpine failed', err);
    }
  }

  // ── Gmail matches ──────────────────────────────────────────────────────
  // email_missing_purchase_orders carries the PO numbers as text[]; the
  // mirror's normalized number is the canonical join key.
  const poNumberNorm = mirror?.zoho_purchaseorder_number
    ? mirror.zoho_purchaseorder_number.toUpperCase().replace(/[^A-Z0-9]/g, '')
    : '';
  let gmail: Array<{
    id: number;
    gmail_msg_id: string;
    gmail_thread_id: string | null;
    email_subject: string | null;
    email_from: string | null;
    email_received: string | null;
    status: string | null;
    scanned_at: string | null;
  }> = [];
  if (poNumberNorm) {
    const gm = await tenantQuery(
      orgId,
      `SELECT id, gmail_msg_id, gmail_thread_id, email_subject, email_from,
                email_received::text, status, scanned_at::text
           FROM email_missing_purchase_orders
          WHERE $1 = ANY(po_numbers_norm)
            AND organization_id = $2
          ORDER BY scanned_at DESC NULLS LAST, id DESC
          LIMIT 25`,
      [poNumberNorm, orgId],
    );
    gmail = gm.rows as typeof gmail;
  }

  // ── Delivery emails ("ORDER DELIVERED" signals for this PO's order#) ──── The simplified Incoming details view:
  let delivered_emails: Array<{
    gmail_msg_id: string;
    gmail_thread_id: string | null;
    order_number: string;
    email_subject: string | null;
    email_from: string | null;
    snippet: string | null;
    delivered_at: string | null;
  }> = [];
  if (poNumberNorm) {
    const de = await tenantQuery(
      orgId,
      `SELECT gmail_msg_id, gmail_thread_id, order_number, email_subject,
                email_from, snippet, delivered_at::text
           FROM email_delivery_signals
          WHERE order_number_norm = $1
            AND organization_id = $2
          ORDER BY delivered_at DESC
          LIMIT 25`,
      [poNumberNorm, orgId],
    );
    delivered_emails = de.rows as typeof delivered_emails;
  }

  // ── Zoho activity (pulled from the raw jsonb if present) ─────────────── Zoho Inventory's PO detail sometimes exposes `activity_log`…
  const zoho_activity: Array<{
    timestamp: string | null;
    label: string;
    description: string | null;
  }> = (() => {
    const raw = (mirror?.raw ?? {}) as Record<string, unknown>;
    const candidates: Array<{ timestamp: string | null; label: string; description: string | null }> = [];

    const pushFromArray = (arr: unknown, label: string) => {
      if (!Array.isArray(arr)) return;
      for (const e of arr.slice(0, 50)) {
        if (!e || typeof e !== 'object') continue;
        const o = e as Record<string, unknown>;
        const ts =
          (o.event_time as string | undefined) ??
          (o.activity_time as string | undefined) ??
          (o.date as string | undefined) ??
          (o.modified_time as string | undefined) ??
          null;
        const desc =
          (o.description as string | undefined) ??
          (o.activity_description as string | undefined) ??
          (o.notes as string | undefined) ??
          null;
        const named =
          (o.activity_type as string | undefined) ??
          (o.activity_name as string | undefined) ??
          (o.event_type as string | undefined) ??
          label;
        candidates.push({ timestamp: ts, label: named, description: desc });
      }
    };
    pushFromArray(raw.activity_log, 'activity');
    pushFromArray(raw.history, 'history');
    pushFromArray(raw.activities, 'activity');
    return candidates;
  })();

  // Carton zoho_notes (synced PO header) wins; else mirror raw.notes from last fat pull.
  const mirrorRawNotes = (() => {
    const raw = (mirror?.raw ?? {}) as Record<string, unknown>;
    const n = raw.notes;
    return typeof n === 'string' && n.trim() ? n : null;
  })();
  const po_notes =
    (recv?.zoho_notes ?? '').trim() || mirrorRawNotes || null;

  return {
    po: mirror,
    receiving: recv,
    po_notes,
    line_items,
    shipment: recv?.shipment_id
      ? {
          shipment_id: recv.shipment_id,
          tracking_number: recv.shipment_tracking_number_raw,
          carrier: recv.shipment_carrier,
          latest_status_category: recv.shipment_status_category,
          is_delivered: recv.shipment_is_delivered,
          delivered_at: recv.shipment_delivered_at,
          last_checked_at: recv.shipment_last_checked_at,
          out_for_delivery_at: recv.shipment_out_for_delivery_at,
          events: shipmentEvents,
        }
      : null,
    receive_events: receiveEvents.map((e) => ({
      id: e.id,
      occurred_at: e.occurred_at,
      event_type: e.event_type,
      actor_staff_id: e.actor_staff_id,
      actor_name: e.actor_name,
      station: e.station,
      sku: e.sku,
      serial_number: e.serial_number,
      serial_unit_id: e.serial_unit_id,
      prev_status: e.prev_status,
      next_status: e.next_status,
      notes: e.notes,
    })),
    gmail,
    delivered_emails,
    zoho_activity,
    notes: recv?.support_notes ?? null,
  };
    },
  );

  return NextResponse.json({ success: true, ...payload });
}, { permission: 'receiving.view' });
