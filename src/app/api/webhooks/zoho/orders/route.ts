import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** LEGACY — /api/webhooks/zoho/orders is retired (audit F05). */

const GONE_BODY = {
  ok: false,
  error: 'gone',
  hint:
    'This endpoint is retired. Re-register the webhook against the tokenized ' +
    'endpoint /api/zoho/webhooks/{token} (per-org token; see Zoho integration settings).',
} as const;

export async function POST() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}

/** Zoho's "Test" button probe gets the same pointer. */
export async function GET() {
  return NextResponse.json(GONE_BODY, { status: 410 });
}
