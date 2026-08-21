/**
 * Assistant READ tools for moving receiving photos between orders.
 *
 * These exist because the agent could already *talk* about an order and could
 * already *move* a photo, but had no way to get from one to the other: the
 * domain speaks `RECEIVING` / `RECEIVING_LINE` ids while an operator speaks
 * "order 12-34567-89012", and no tool listed the photos hanging off a line.
 *
 * Two tools, deliberately narrow:
 *   • resolve_receiving_line_for_order — (carton, order id) → line id(s)
 *   • list_receiving_line_photos       — line/carton → the photo ids to move
 *
 * Both are READS. The move itself goes through `propose_mutation` with
 * `receiving_photo.reassign`, so it stays behind the one AI write chokepoint
 * (trust class, audit, revert) rather than becoming a second write path.
 */

import { z } from 'zod';
import { tenantQuery } from '@/lib/tenancy/db';
import { listReceivingPhotos } from '@/lib/photos/queries/receiving-list';
import type { AssistantToolDef, AssistantToolDeps } from './types';
import type { OrgId } from '@/lib/tenancy/constants';

export interface ReceivingLineForOrderDeps {
  /** Org-scoped read (RLS GUC set) — never a raw pool query. */
  query: (
    orgId: OrgId,
    text: string,
    params: ReadonlyArray<unknown>,
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
}
const defaultLineForOrderDeps: ReceivingLineForOrderDeps = {
  query: (orgId, text, params) => tenantQuery(orgId, text, params),
};

/**
 * `receiving_line.source_order_id` is the per-line source order — the carton's
 * own `zoho_purchaseorder_number` is only a display representative and must NOT
 * be used to answer "which line is this order" (see carton-source-link.ts).
 */
export const resolveReceivingLineForOrderTool: AssistantToolDef<
  z.ZodObject<{ receivingId: z.ZodNumber; orderId: z.ZodString }>
> = {
  name: 'resolve_receiving_line_for_order',
  description:
    'Find the receiving line(s) on a carton that belong to a given source order id. Use this to turn an operator\'s "order 12-345" into the line id that photo tools need. Returns every match — an order can span more than one line.',
  permission: 'receiving.view',
  inputSchema: z.object({
    receivingId: z.number().int().positive(),
    orderId: z.string().min(1).max(120),
  }),
  run: async (input, ctx, deps) => {
    const d =
      (deps as AssistantToolDeps & { receivingLineForOrder?: ReceivingLineForOrderDeps })
        .receivingLineForOrder ?? defaultLineForOrderDeps;
    const res = await d.query(
      ctx.organizationId as OrgId,
      `SELECT id, source_order_id, source_system, sku, item_name
         FROM receiving_line
        WHERE organization_id = $1
          AND receiving_id = $2
          AND btrim(lower(source_order_id)) = btrim(lower($3))
        ORDER BY id ASC`,
      [ctx.organizationId, input.receivingId, input.orderId],
    );
    const lines = res.rows.map((r) => ({
      lineId: Number(r.id),
      orderId: r.source_order_id == null ? null : String(r.source_order_id),
      sourceSystem: r.source_system == null ? null : String(r.source_system),
      sku: r.sku == null ? null : String(r.sku),
      itemName: r.item_name == null ? null : String(r.item_name),
    }));
    return {
      count: lines.length,
      lines,
      // Stated, not implied: an empty result is a real answer the model must
      // relay rather than paper over by guessing a line id.
      note:
        lines.length === 0
          ? `No line on carton ${input.receivingId} carries source order "${input.orderId}".`
          : null,
    };
  },
};

export interface ReceivingLinePhotosDeps {
  list: typeof listReceivingPhotos;
}
const defaultLinePhotosDeps: ReceivingLinePhotosDeps = { list: listReceivingPhotos };

export const listReceivingLinePhotosTool: AssistantToolDef<
  z.ZodObject<{ receivingId: z.ZodNumber; lineId: z.ZodOptional<z.ZodNumber> }>
> = {
  name: 'list_receiving_line_photos',
  description:
    'List the photos attached to one receiving line, or to the carton itself when lineId is omitted. Returns photo ids suitable for receiving_photo.reassign. Use before moving photos so you move exactly the ones that exist.',
  permission: 'photos.view',
  inputSchema: z.object({
    receivingId: z.number().int().positive(),
    lineId: z.number().int().positive().optional(),
  }),
  run: async (input, ctx, deps) => {
    const d =
      (deps as AssistantToolDeps & { receivingLinePhotos?: ReceivingLinePhotosDeps })
        .receivingLinePhotos ?? defaultLinePhotosDeps;
    const rows = await d.list({
      organizationId: ctx.organizationId as OrgId,
      receivingId: input.receivingId,
      lineId: input.lineId ?? null,
      // Carton-level when no line is named: the photos hanging off the box.
      scope: input.lineId == null ? 'po' : undefined,
    });
    return {
      count: rows.length,
      scope: input.lineId == null ? 'carton' : 'line',
      photos: rows.map((r) => ({
        photoId: r.id,
        photoType: r.photoType,
        photoAspect: r.photoAspect,
        caption: r.caption,
        // Which record it currently hangs off, so the model can tell an
        // already-correct photo from one that needs moving.
        entityType: r.entityType,
        entityId: r.entityId,
      })),
    };
  },
};
