/**
 * POST /api/sessions/[id]/resume — reopen a parked session, or take its lease.
 *
 * 409 when another live lease holds it and the caller asserted a stale
 * `expectedVersion`; the response carries `currentVersion` so the client can
 * reconcile rather than guess. Idempotent on `Idempotency-Key` /
 * `clientEventId`. Shared body: src/lib/sessions/lifecycle-route.ts.
 *
 * Resuming a SCAN session deliberately does NOT arm it — arming moves the wedge
 * app-wide, and a resume that silently stole every scan from the operator
 * actually working is the exact mount-order surprise the one-armed rule exists
 * to delete. Call `PATCH /api/sessions/[id]` with `action: 'arm'` as its own act.
 */

import type { NextRequest } from 'next/server';

import { withAuth } from '@/lib/auth/withAuth';
import { handleLifecyclePost } from '@/lib/sessions/lifecycle-route';

export const POST = withAuth((req: NextRequest, ctx) => handleLifecyclePost(req, ctx, 'resume'));
