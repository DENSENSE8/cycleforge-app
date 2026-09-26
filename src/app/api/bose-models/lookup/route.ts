import { NextRequest, NextResponse } from 'next/server';
import { lookupCompatibility } from '@/lib/neon/bose-model-queries';
import { withAuth } from '@/lib/auth/withAuth';

/** GET /api/bose-models/lookup?serial=… | ?model=… */
export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const serial = searchParams.get('serial');
  const model = searchParams.get('model');

  if (!serial?.trim() && !model?.trim()) {
    return NextResponse.json(
      { success: false, error: 'Provide a serial or model query parameter' },
      { status: 400 },
    );
  }

  const result = await lookupCompatibility({ serial, model });
  return NextResponse.json({ success: true, ...result });
}, { permission: 'sourcing.view' });
