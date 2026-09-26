import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  findByNormalizedSerial,
  findShippedOrderForSerialUnit,
  type MatchedOrderForSerial,
} from '@/lib/neon/serial-units-queries';
import { findShippedOrderByTsnSerial } from '@/lib/neon/tsn-shipped-order';

/** GET /api/serial-units/lookup?serial=<value> */
export const GET = withAuth(async (request, ctx) => {
  const raw = request.nextUrl.searchParams.get('serial') ?? '';
  const trimmed = raw.trim();
  if (!trimmed) {
    return NextResponse.json(
      { success: false, error: 'serial query param is required' },
      { status: 400 },
    );
  }

  try {
    const row = await findByNormalizedSerial(trimmed, ctx.organizationId);

    // Resolve the originating sales order two ways:
    let matched: (MatchedOrderForSerial & { serial_number?: string }) | null =
      row && row.current_status === 'SHIPPED'
        ? await findShippedOrderForSerialUnit(row.id, {
            organizationId: ctx.organizationId,
          })
        : null;
    if (!matched) {
      matched = await findShippedOrderByTsnSerial(trimmed, {
        organizationId: ctx.organizationId,
      });
    }

    // Not found anywhere — neither an inventory unit nor a shipped serial.
    if (!row && !matched) {
      return NextResponse.json({
        success: true,
        serial: trimmed.toUpperCase(),
        found: false,
        is_return: false,
        unit: null,
        matched_order: null,
      });
    }

    // A serial we shipped (v2 SHIPPED, or any tech ship resolved above) coming
    // back across receiving is a genuine return.
    const isReturn = row?.current_status === 'SHIPPED' || !!matched;

    // Prefer the real serial_units row; otherwise synthesize a minimal unit
    // from the shipped-order match so the UI band still renders the facts.
    const unit = row
      ? {
          id: row.id,
          serial_number: row.serial_number,
          sku: row.sku,
          current_status: row.current_status,
          condition_grade: row.condition_grade,
          current_location: row.current_location,
          updated_at: row.updated_at,
          is_return: isReturn,
        }
      : {
          id: null,
          serial_number: matched?.serial_number ?? trimmed.toUpperCase(),
          sku: matched?.sku ?? null,
          current_status: 'SHIPPED',
          condition_grade: null,
          current_location: null,
          updated_at: null,
          is_return: true,
        };

    return NextResponse.json({
      success: true,
      serial: row?.normalized_serial ?? trimmed.toUpperCase(),
      found: true,
      is_return: isReturn,
      unit,
      matched_order: matched
        ? {
            order_id: matched.order_id,
            item_number: matched.item_number,
            account_source: matched.account_source,
            product_title: matched.product_title,
            sku: matched.sku,
            condition: matched.condition,
            tracking_number: matched.tracking_number,
            allocation_state: matched.allocation_state,
          }
        : null,
    });
  } catch (err) {
    console.error('serial-units/lookup failed', err);
    return NextResponse.json(
      { success: false, error: 'Serial lookup failed' },
      { status: 500 },
    );
  }
});
