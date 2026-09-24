'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { useAuth } from '@/contexts/AuthContext';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { sendWithBuyerNoteAck } from '@/lib/orders/buyer-note-ack-client';

type StartResponse = {
  success: true;
  packerLogId: number;
  orderId: string;
  trackingNumber: string;
};

function isStartResponse(value: unknown): value is StartResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<StartResponse>;
  return response.success === true
    && typeof response.packerLogId === 'number'
    && typeof response.orderId === 'string'
    && typeof response.trackingNumber === 'string';
}

function startFailureMessage(value: unknown): string {
  if (value && typeof value === 'object' && 'error' in value && typeof value.error === 'string') {
    return value.error;
  }
  return 'Could not start packing.';
}

/**
 * Mobile pack entry from a completed pick. It creates (or resumes) only the
 * CAPTURING evidence parent, then enters the existing guided photo studio.
 * The studio's Finish action owns the physical PACKED transition.
 */
export default function MobilePackStartPage() {
  const params = useParams<{ orderId: string }>();
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const orderRowId = Number(params?.orderId);
  const startedFor = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const returnToPick = useCallback(() => {
    if (Number.isSafeInteger(orderRowId) && orderRowId > 0) {
      router.replace(`/m/pick/${orderRowId}`);
      return;
    }
    router.replace('/m/pick');
  }, [orderRowId, router]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.replace(`/signin?next=/m/pack/start/${params?.orderId ?? ''}`);
      return;
    }
    if (!Number.isSafeInteger(orderRowId) || orderRowId <= 0) {
      setError('This pick does not have a valid order. Return to the queue and try again.');
      return;
    }
    if (startedFor.current === orderRowId && attempt === 0) return;
    startedFor.current = orderRowId;

    let cancelled = false;
    void (async () => {
      try {
        setError(null);
        // A held order (buyer note) opens the note first; acknowledging it
        // retries under a fresh key — see sendWithBuyerNoteAck.
        const response = await sendWithBuyerNoteAck(() => {
          const idempotencyKey = safeRandomUUID();
          return fetch('/api/packing-logs/draft', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
            },
            body: JSON.stringify({ orderId: orderRowId, clientEventId: idempotencyKey }),
          });
        });
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !isStartResponse(body)) {
          throw new Error(startFailureMessage(body));
        }
        if (cancelled) return;
        const query = new URLSearchParams({
          orderId: body.orderId,
          complete: '1',
        });
        router.replace(`/m/p/${body.packerLogId}/photos?${query.toString()}`);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Could not start packing.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attempt, isLoaded, orderRowId, params?.orderId, router, user]);

  return (
    <div className="grid min-h-[100dvh] place-items-center bg-surface-card px-6 py-10 text-center">
      <div className="max-w-sm border border-border-hairline bg-surface-card px-5 py-6">
        {error ? (
          <>
            <p className="text-role-eyebrow font-semibold uppercase tracking-wide text-text-danger">Packing not started</p>
            <p className="mt-2 text-sm text-text-soft">{error}</p>
            <div className="mt-5 grid gap-2">
              <Button
                type="button"
                variant="brand"
                radius="flush"
                onClick={() => {
                  startedFor.current = null;
                  setAttempt((value) => value + 1);
                }}
              >
                Retry starting pack
              </Button>
              <Button type="button" variant="secondary" radius="flush" onClick={returnToPick}>
                Back to pick
              </Button>
            </div>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-7 w-7 animate-spin text-text-muted" aria-hidden />
            <p className="mt-3 text-role-eyebrow font-semibold uppercase tracking-wide text-text-muted">Preparing pack evidence</p>
            <p className="mt-2 text-sm text-text-soft">Opening guided slip and box capture…</p>
          </>
        )}
      </div>
    </div>
  );
}
