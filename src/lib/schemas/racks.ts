import { z } from 'zod';
import {
  RACK_MAX_POSITIONS_PER_SHELF,
  RACK_MAX_SHELVES,
  type AdoptBayBody,
  type CreateRackBody,
  type EditRackShelvesBody,
  type MoveRackBody,
  type RackErrorBody,
  type RackLabelsPrintedBody,
} from '@/lib/locations/rack-types';

/** `/api/racks/**` request bodies. Shapes are the wire contract in `rack-types.ts`. */

const clientEventId = z.string().trim().min(8, 'clientEventId is required').max(120);
const code = z.string().trim().min(1).max(200);
const id = z.number().int().positive();
const tier = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

const exactlyOne = (a: unknown, b: unknown) => (a !== undefined) !== (b !== undefined);

export const CreateRackBodySchema = z
  .object({
    placementCode: code.optional(),
    placementId: id.optional(),
    shelves: z.number().int().min(1).max(RACK_MAX_SHELVES),
    shelfTiers: z.array(z.object({ shelf: z.number().int().min(1).max(RACK_MAX_SHELVES), tier }).strict()).max(RACK_MAX_SHELVES).optional(),
    positionsPerShelf: z.number().int().min(0).max(RACK_MAX_POSITIONS_PER_SHELF).optional(),
    dryRun: z.boolean().optional(),
    clientEventId,
  })
  .strict()
  .refine((b) => exactlyOne(b.placementCode, b.placementId), { message: 'Give exactly one of placementCode or placementId' });

export const MoveRackBodySchema = z
  .object({
    destinationCode: code.optional(),
    destinationId: id.optional(),
    clientEventId,
  })
  .strict()
  .refine((b) => exactlyOne(b.destinationCode, b.destinationId), { message: 'Give exactly one of destinationCode or destinationId' });

export const EditRackShelvesBodySchema = z
  .object({
    add: z.number().int().min(0).max(RACK_MAX_SHELVES).optional(),
    remove: z.array(code).max(RACK_MAX_SHELVES).optional(),
    clientEventId,
  })
  .strict()
  .refine((b) => (b.add ?? 0) > 0 || (b.remove?.length ?? 0) > 0, { message: 'Nothing to add or remove' });

export const RackLabelsPrintedBodySchema = z
  .object({
    codes: z.array(code).min(1).max(1000),
    transport: z.string().trim().min(1).max(40),
    clientEventId,
  })
  .strict();

export const AdoptBayBodySchema = z
  .object({
    bayCode: code,
    keepBarcodes: z.boolean(),
    dryRun: z.boolean().optional(),
    clientEventId,
  })
  .strict();

/** Parse a rack body: the data, or the `RackErrorBody` every rack route returns on 400. */
export function parseRackBody<T>(
  schema: z.ZodType<T>,
  raw: unknown,
): { data: T } | { error: RackErrorBody & { issues: Array<{ path: string; message: string }> } } {
  const r = schema.safeParse(raw);
  if (r.success) return { data: r.data };
  const issues = r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  return { error: { error: issues[0]?.message ?? 'Invalid body', code: 'invalid', issues } };
}

// Compile-time pin: each schema's output is assignable to its wire type.
type Assert<T extends true> = T;
export type _RackSchemaPins = [
  Assert<z.output<typeof CreateRackBodySchema> extends CreateRackBody ? true : false>,
  Assert<z.output<typeof MoveRackBodySchema> extends MoveRackBody ? true : false>,
  Assert<z.output<typeof EditRackShelvesBodySchema> extends EditRackShelvesBody ? true : false>,
  Assert<z.output<typeof RackLabelsPrintedBodySchema> extends RackLabelsPrintedBody ? true : false>,
  Assert<z.output<typeof AdoptBayBodySchema> extends AdoptBayBody ? true : false>,
];
