/**
 * POST /api/sessions/[id]/park — set a session aside, retry-safe.
 *
 * Idempotent on `Idempotency-Key` / `clientEventId`: a retry over a flaky floor
 * link replays the original response instead of double-parking. Shared body and
 * the rationale for existing beside `PATCH /api/sessions/[id]`:
 * src/lib/sessions/lifecycle-route.ts.
 */

import type { NextRequest } from 'next/server';

import { withAuth } from '@/lib/auth/withAuth';
import { handleLifecyclePost } from '@/lib/sessions/lifecycle-route';

export const POST = withAuth((req: NextRequest, ctx) => handleLifecyclePost(req, ctx, 'park'));
