import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { recordLabelPrintJob } from '@/lib/labels/print-jobs';
import type { OrgId } from '@/lib/tenancy/constants';

export const dynamic = 'force-dynamic';

/** POST /api/label-print-jobs */
const JobSchema = z.object({
  jobType: z.enum(['UNIT', 'MANIFEST', 'HANDLING_UNIT', 'REPRINT', 'LOCATION']),
  serialUnitId: z.number().int().positive().nullable().optional(),
  manifestId: z.number().int().positive().nullable().optional(),
  handlingUnitId: z.number().int().positive().nullable().optional(),
  unitUid: z.string().trim().min(1).nullable().optional(),
  qrPayload: z.string().trim().min(1),
  symbology: z.string().trim().min(1).nullable().optional(),
  templateId: z.string().trim().min(1).nullable().optional(),
  printerProfileId: z.number().int().positive().nullable().optional(),
  copies: z.number().int().min(1).max(999).nullable().optional(),
  isReprint: z.boolean().nullable().optional(),
  reprintOfId: z.number().int().positive().nullable().optional(),
  clientEventId: z.string().trim().min(1).nullable().optional(),
  /** This computer's print station id — the station's job log. */
  stationId: z.string().trim().min(1).max(100).nullable().optional(),
});

const BodySchema = z.object({
  jobs: z.array(JobSchema).min(1).max(500),
});

export const POST = withAuth(
  async (request, ctx) => {
    const orgId = ctx.organizationId as OrgId;
    const raw = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid body', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const rows = await Promise.all(
      parsed.data.jobs.map((j) =>
        recordLabelPrintJob({ ...j, actorStaffId: ctx.staffId ?? null }, orgId),
      ),
    );
    const jobs = rows.filter((r): r is NonNullable<typeof r> => r != null);
    return NextResponse.json({ ok: true, recorded: jobs.length, jobs });
  },
  { permission: 'print.label' },
);
