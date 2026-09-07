/**
 * get_packing_performance — the pack floor's day, as a rendered report.
 *
 * The tool returns a `ToolArtifactEnvelope`: the validated report goes to the
 * panel, and only the one-sentence `summary` reaches the model (see
 * `tool-artifact.ts`). That is deliberate — an owner's packing report must
 * reconcile with the database it came from, and a model retyping earned minutes
 * cannot guarantee that.
 *
 * The description below carries the operator's own sentences verbatim so the
 * router picks this tool instead of a generic table read.
 */

import { z } from 'zod';
import { buildPackingPerformanceReport } from '@/lib/reports/packing-performance';
import type { AssistantToolDef } from './types';

const packingPerformanceInput = z.object({
  /** A name as the owner says it — resolved against active staff, never guessed. */
  staffName: z.string().trim().min(1).max(80).optional(),
  /** Exact staff id when the caller already has it (skips name resolution). */
  staffId: z.number().int().positive().optional(),
  /** PST calendar day, `YYYY-MM-DD`. Defaults to today in the operator's timezone. */
  dayPst: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const getPackingPerformanceTool: AssistantToolDef<typeof packingPerformanceInput> = {
  name: 'get_packing_performance',
  description:
    "Packing performance for one packer or the whole pack floor on a PST day. Use for \"What is <staff name>'s packing performance today?\", \"how many boxes did X pack\", \"packer efficiency\", \"wait minutes\", \"minutes per box\", \"who packed what today\", and \"which items took the longest to pack\". Returns boxes packed, the small/medium/big tier mix, earned (standard) minutes at 5/15/60 per box, handle minutes (scan to complete), wait minutes (idle between boxes, breaks excluded), efficiency, utilization, capacity left, a per-packer table, and an item-number-to-time table. This RENDERS a report on the panel: describe the headline in one sentence and never restate the tables, row counts, or column values in chat.",
  permission: 'operations.view',
  inputSchema: packingPerformanceInput,
  run: (input, ctx, deps) => buildPackingPerformanceReport(input, ctx, deps),
};
