import { NextRequest, NextResponse } from 'next/server';
import { lookupCompatibility } from '@/lib/neon/bose-model-queries';
import { withAuth } from '@/lib/auth/withAuth';

/** GET /api/product-models/lookup?serial=… | ?model=… */
export const GET = withAuth(async (req: NextRequest) => {
  try {
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
  } catch (error: any) {
    console.error('Error in GET /api/product-models/lookup:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Lookup failed' },
      { status: 500 },
    );
  }
}, { permission: 'sourcing.view' });
