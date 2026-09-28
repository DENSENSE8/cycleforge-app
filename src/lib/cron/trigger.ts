/**
 * Run a cron route now, from a signed-in request: hit our own route (same
 * origin) with the CRON_SECRET so it runs through its lock and run ledger
 * exactly as the scheduler would.
 */
export interface CronTriggerResult {
  ok: boolean;
  status: number;
  result: unknown;
  error?: string;
}

export async function triggerCronPath(origin: string, path: string): Promise<CronTriggerResult> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, result: null, error: 'CRON_SECRET not configured' };
  try {
    const res = await fetch(`${origin}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store',
    });
    const result = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, result };
  } catch (error) {
    return { ok: false, status: 502, result: null, error: error instanceof Error ? error.message : 'trigger failed' };
  }
}
