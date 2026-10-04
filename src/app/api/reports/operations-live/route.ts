import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth/withAuth';
import { parseBody } from '@/lib/schemas/parse';
import { getOperationsReportForDay } from '@/lib/reports/operations-report';
import { getCurrentPSTDateKey } from '@/utils/date';

const QuerySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

/** One read model for the mobile live pick + pack report. */
export const GET = withAuth(async (request: NextRequest, ctx) => {
  const parsed = parseBody(QuerySchema, Object.fromEntries(new URL(request.url).searchParams.entries()));
  if (parsed instanceof NextResponse) return parsed;
  const payload = await getOperationsReportForDay(
    ctx.organizationId,
    parsed.day ?? getCurrentPSTDateKey(),
  );
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
}, { permission: 'operations.view' });
