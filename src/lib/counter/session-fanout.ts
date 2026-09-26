/** Server-side fan-out for counter-session mutations. */

import { after } from 'next/server';
import { publishCounterSessionEvent } from '@/lib/realtime/publish';
import type { CounterSessionResult } from './session-store';

export async function fanOutCounterSession(
  organizationId: string,
  result: CounterSessionResult,
): Promise<CounterSessionResult> {
  if (!result.ok) return result;

  const kioskDeviceId = result.snapshot.kioskDeviceId;
  if (kioskDeviceId === null) return result;

  // Fire-and-forget after the response, per backend-patterns.md — a realtime
  // notification must never sit between the operator and their answer.
  after(async () => {
    await publishCounterSessionEvent({
      organizationId,
      kioskDeviceId,
      event: result.event as never,
    });
  });

  return result;
}
