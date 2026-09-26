import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { withAuth } from '@/lib/auth/withAuth';

export const runtime = 'nodejs';

/** Generates a new chat session ID server-side. */
export const POST = withAuth(async () => {
  return NextResponse.json({ session_id: randomUUID() });
}, { permission: 'dashboard.view', feature: 'aiChat' });
