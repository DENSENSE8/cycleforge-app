/** POST /api/print-station-device/print-jobs — an enrolled station logs the 2×1 labels it printed. */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPrintStationAuth } from '@/lib/auth/withPrintStationAuth';
import { recordLabelPrintJob } from '@/lib/labels/print-jobs';
import { listStationJobs } from '@/lib/print/print-station-registry';

export const runtime = 'nodejs';

// The station comes from the device credential — a body `stationId` is
// stripped — and no staff is the actor.
const FnskuJobSchema = z.object({
  jobType: z.literal('REPRINT'),
  qrPayload: z.string().trim().regex(/^[A-Z0-9]{1,40}$/),
  symbology: z.literal('code128'),
  templateId: z.literal('fba_fnsku'),
  copies: z.number().int().min(1).max(999),
  isReprint: z.literal(true),
  clientEventId: z.string().trim().min(1).max(100),
});

// A unit label names its serial unit; a package label names its manifest —
// exactly one of the two.
const ProductJobSchema = z.object({
  jobType: z.enum(['UNIT', 'MANIFEST', 'REPRINT']),
  serialUnitId: z.number().int().positive().nullable().optional(),
  manifestId: z.number().int().positive().nullable().optional(),
  unitUid: z.string().trim().min(1).max(100).nullable(),
  qrPayload: z.string().trim().regex(/^[A-Za-z0-9._-]{1,100}$/),
  symbology: z.literal('datamatrix'),
  templateId: z.literal('product'),
  copies: z.literal(1),
  isReprint: z.boolean(),
  clientEventId: z.string().trim().min(1).max(100),
});

const JobSchema = z.discriminatedUnion('templateId', [FnskuJobSchema, ProductJobSchema]).superRefine((job, ctx) => {
  if (job.templateId !== 'product') return;
  if ((job.serialUnitId == null) === (job.manifestId == null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Exactly one of serialUnitId or manifestId' });
  }
});

const BodySchema = z.object({ jobs: z.array(JobSchema).min(1).max(20) });

/** The device's own recent history for the on-screen queue after a reload. */
export const GET = withPrintStationAuth(async (_req: NextRequest, ctx) => {
  const jobs = await listStationJobs(ctx.organizationId, ctx.stationId, 12);
  return NextResponse.json({ jobs }, { headers: { 'cache-control': 'no-store' } });
});

export const POST = withPrintStationAuth(async (req: NextRequest, ctx) => {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Invalid body' }, { status: 400 });
  const rows = await Promise.all(
    parsed.data.jobs.map((job) =>
      recordLabelPrintJob({ ...job, actorStaffId: null, stationId: ctx.stationId }, ctx.organizationId),
    ),
  );
  return NextResponse.json({ ok: true, recorded: rows.filter((row) => row != null).length });
});
