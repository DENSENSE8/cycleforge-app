import { z } from 'zod';
import {
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_VALUE_TYPES,
} from '@/lib/custom-fields/types';

export const CustomFieldEntityTypeSchema = z.enum(CUSTOM_FIELD_ENTITY_TYPES);
const CustomFieldValueTypeSchema = z.enum(CUSTOM_FIELD_VALUE_TYPES);

export const CustomFieldDefCreateBody = z
  .object({
    entityType: CustomFieldEntityTypeSchema,
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,63}$/, 'key must be snake_case starting with a letter'),
    label: z.string().trim().min(1).max(80),
    type: CustomFieldValueTypeSchema,
    options: z.unknown().optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .strict();

export const CustomFieldValueUpsertBody = z
  .object({
    fieldId: z.number().int().positive(),
    entityType: CustomFieldEntityTypeSchema,
    entityId: z.number().int().positive(),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .strict();
