import { z } from 'zod';

/** Validation for the kit-parts ("what's in the box" / BOM) authoring endpoints. */

const trimmed = z.string().trim();

/** Component kind — drives the row tag in the packer checklist. Free text is
 *  accepted (max 40) so a tenant can coin its own, but these are the defaults. */
export const KIT_PART_TYPES = [
  'PART',
  'ACCESSORY',
  'CABLE',
  'ADAPTER',
  'REMOTE',
  'MANUAL',
  'PACKAGING',
] as const;
export type KitPartType = (typeof KIT_PART_TYPES)[number];

/** Fields shared by create + update (all optional on both — create defaults
 *  them server-side, update treats absent as "leave unchanged"). */
const sharedFields = {
  componentType: trimmed.max(40).optional(),
  qtyRequired: z.number().int().min(1).max(999).optional(),
  /** Condition grades this part is required for (e.g. ['REFURBISHED']). Empty/
   *  null ⇒ required for ALL conditions (the common case). */
  requiredFor: z.array(trimmed.min(1)).nullish(),
  /** Critical parts drive the "all required items in the box" pack signal. */
  isCritical: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
  /** Reference insert (2026-08-01d). */
  documentUrl: z
    .string()
    .trim()
    .max(2000)
    .nullish()
    .refine(
      (v) => v == null || v === '' || /^https?:\/\//i.test(v),
      'documentUrl must be an http(s) url',
    ),
  documentTitle: z.string().trim().max(200).nullish(),
  documentMime: z.enum(['pdf', 'image', 'unknown']).nullish(),
};

export const KitPartCreateBody = z.object({
  componentName: trimmed.min(1, 'componentName is required').max(200),
  ...sharedFields,
  idempotencyKey: trimmed.max(120).optional(),
});
export type KitPartCreateInput = z.infer<typeof KitPartCreateBody>;

export const KitPartUpdateBody = z.object({
  partId: z.coerce.number().int().positive(),
  componentName: trimmed.min(1).max(200).optional(),
  ...sharedFields,
});
export type KitPartUpdateInput = z.infer<typeof KitPartUpdateBody>;

export const KitPartDeleteBody = z.object({
  partId: z.coerce.number().int().positive(),
});
