import { NextResponse } from 'next/server';
import { syncEcwidToSquare } from '@/lib/ecwid-square/sync';
import { isAllowedAdminOrigin } from '@/lib/security/allowed-origin';
import { withAuth } from '@/lib/auth/withAuth';

/** POST /api/ecwid-square/sync Triggers one-way Ecwid -> Square catalog sync. */
export const POST = withAuth(async (req: Request) => {
  if (!isAllowedAdminOrigin(req)) {
    return NextResponse.json(
      {
        success: false,
        error: `Origin not allowed: ${req.headers.get('origin')}`,
      },
      { status: 403 }
    );
  }

  let dryRun = false;
  let batchSize: number | undefined = undefined;
  try {
    const body = (await req.json()) as { dryRun?: boolean; batchSize?: number };
    dryRun = Boolean(body?.dryRun);
    if (typeof body?.batchSize === 'number' && Number.isFinite(body.batchSize)) {
      batchSize = body.batchSize;
    }
  } catch {
    // Ignore JSON parse failures and continue with defaults.
  }

  const result = await syncEcwidToSquare({ dryRun, batchSize });
  const status = result.success ? 200 : 500;

  return NextResponse.json(result, { status });
}, { permission: 'integrations.ecwid' });
