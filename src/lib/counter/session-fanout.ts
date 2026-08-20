/**
 * Server-side fan-out for counter-session mutations.
 *
 * Pass-through by design: it takes the result a verb returned, publishes its
 * event to the device bridge, and hands the same result back — so a route reads
 * `deskResult(await fanOutCounterSession(org, await addLine(...)))` and cannot
 * accidentally answer without notifying the other screen.
 *
 * **The server publishes, not the mutating client.** The client that wrote
 * already has its answer in the HTTP response; a client-side publish would only
 * serve the far screen, and would stop serving it exactly when that client's own
 * socket dropped. Publishing here means a desk with a dead websocket still
 * drives the tablet.
 *
 * A refusal publishes nothing — there is no new version to announce, and the
 * caller is the only one who needs to know it lost.
 *
 * Failures are swallowed (`publishEvent` logs them): the write is already
 * committed, and a dropped publish costs the far screen one poll interval (D7),
 * never a lost edit.
 *
 * Plan: `docs/todo/kiosk-desk-session-channel-PLAN.md` (P4 · D1 · D2 · D7).
 */

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
