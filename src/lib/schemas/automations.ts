import { z } from 'zod';

/** Listing→staff defaults and to-ship upserts. Do not add identification here. */
export const LISTING_AUTOMATION_TRIGGER_KEYS = [
  'order.imported',
  'order.item_number_set',
  'unit.test_passed',
] as const;

/**
 * Identification writers (scan-out POST, pick session start). P3 then-actions
 * subscribe here. Listing upserts must not include this key or TEST would fire
 * on every dock scan via selectActionsForTrigger's listing branch.
 */
const IDENTIFICATION_AUTOMATION_TRIGGER_KEYS = ['identification.completed'] as const;

export const AUTOMATION_TRIGGER_KEYS = [
  ...LISTING_AUTOMATION_TRIGGER_KEYS,
  ...IDENTIFICATION_AUTOMATION_TRIGGER_KEYS,
] as const;

type ListingAutomationTriggerKey = (typeof LISTING_AUTOMATION_TRIGGER_KEYS)[number];
type IdentificationAutomationTriggerKey =
  (typeof IDENTIFICATION_AUTOMATION_TRIGGER_KEYS)[number];
export type AutomationTriggerKey = (typeof AUTOMATION_TRIGGER_KEYS)[number];

/**
 * `backup_staff_id` takes the action when `staff_id` is out that PST day
 * (inactive, unscheduled, or approved time off). Both out → left unassigned.
 */
export const AutomationAssignAction = z
  .object({
    type: z.literal('assign_work'),
    work_type: z.enum(['PICK', 'PACK']),
    staff_id: z.number().int().positive(),
    backup_staff_id: z.number().int().positive().optional(),
  })
  .strict()
  .refine((a) => a.backup_staff_id == null || a.backup_staff_id !== a.staff_id, {
    message: 'backup_staff_id must differ from staff_id',
    path: ['backup_staff_id'],
  });

const AutomationRuleWhen = z
  .object({
    item_number: z.string().trim().min(1).max(120).optional(),
    sku_catalog_id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).optional(),
    sku: z.string().trim().min(1).max(120).optional(),
    account_source: z.string().trim().min(1).max(80).optional(),
  })
  .strict()
  .refine(
    (w) => w.item_number != null || w.sku_catalog_id != null,
    { message: 'when must include item_number or sku_catalog_id' },
  );

export const AutomationRuleCreateBody = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    enabled: z.boolean().optional(),
    priority: z.number().int().min(0).max(10_000).optional(),
    triggerKeys: z.array(z.enum(AUTOMATION_TRIGGER_KEYS)).min(1).optional(),
    when: AutomationRuleWhen,
    then: z.array(AutomationAssignAction).min(1).max(8),
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .strict();

export const AutomationRuleUpdateBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional().nullable(),
    enabled: z.boolean().optional(),
    priority: z.number().int().min(0).max(10_000).optional(),
    triggerKeys: z.array(z.enum(AUTOMATION_TRIGGER_KEYS)).min(1).optional(),
    when: AutomationRuleWhen.optional(),
    then: z.array(AutomationAssignAction).min(1).max(8).optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'at least one field required' });

export const ListingAssignBody = z
  .object({
    orderIds: z.array(z.number().int().positive()).min(1).max(200),
    mode: z.enum(['save_and_assign', 'apply_existing']),
    techId: z.number().int().positive().optional().nullable(),
    packerId: z.number().int().positive().optional().nullable(),
    /** Used when the primary is out that day. Must differ from the primary. */
    backupTechId: z.number().int().positive().optional().nullable(),
    backupPackerId: z.number().int().positive().optional().nullable(),
    idempotencyKey: z.string().min(8).max(128).optional(),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.mode === 'save_and_assign') {
      if (body.techId == null || body.techId <= 0) {
        ctx.addIssue({ code: 'custom', message: 'techId required', path: ['techId'] });
      }
      if (body.packerId == null || body.packerId <= 0) {
        ctx.addIssue({ code: 'custom', message: 'packerId required', path: ['packerId'] });
      }
    }
    if (body.backupTechId != null && body.backupTechId === body.techId) {
      ctx.addIssue({
        code: 'custom',
        message: 'backupTechId must differ from techId',
        path: ['backupTechId'],
      });
    }
    if (body.backupPackerId != null && body.backupPackerId === body.packerId) {
      ctx.addIssue({
        code: 'custom',
        message: 'backupPackerId must differ from packerId',
        path: ['backupPackerId'],
      });
    }
  });

const ListingAssignPreviewQuery = z.object({
  orderIds: z.string().min(1).max(4000),
});

export type AutomationRuleCreateBody = z.infer<typeof AutomationRuleCreateBody>;
export type AutomationRuleUpdateBody = z.infer<typeof AutomationRuleUpdateBody>;
export type ListingAssignBody = z.infer<typeof ListingAssignBody>;
