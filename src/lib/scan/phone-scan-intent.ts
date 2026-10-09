export interface PhoneScanCorrelation {
  mobileScanEventId: number | null;
  clientEventId: string;
}

interface ResolveIntentResponse {
  mobileScanEventId?: unknown;
  mobileRoute?: unknown;
}

/** The persisted intent plus the resolver's route: the phone URL of the one record the scan names, or `null`. */
export interface PhoneScanIntent extends PhoneScanCorrelation {
  mobileRoute: string | null;
}

/** Persist the phone's identify intent before any downstream domain commit. */
export async function resolvePhoneScanIntent(
  input: string,
  clientEventId: string,
): Promise<PhoneScanIntent> {
  try {
    const response = await fetch('/api/scan/resolve', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input,
        device: { surface: '/m/scan', clientEventId },
      }),
    });
    const body = await response.json().catch(() => null) as ResolveIntentResponse | null;
    const id = Number(body?.mobileScanEventId);
    const route = body?.mobileRoute;
    return {
      mobileScanEventId: Number.isSafeInteger(id) && id > 0 ? id : null,
      clientEventId,
      mobileRoute: typeof route === 'string' && route.startsWith('/') && !route.startsWith('//') ? route : null,
    };
  } catch {
    // Domain work remains available when telemetry/realtime is degraded.
    return { mobileScanEventId: null, clientEventId, mobileRoute: null };
  }
}

/** Carry correlation through an identification navigation without trusting it as actor identity. */
export function withPhoneScanCorrelation(href: string, correlation: PhoneScanCorrelation): string {
  if (!href.startsWith('/')) return href;
  const url = new URL(href, 'http://cycleforge.local');
  if (correlation.mobileScanEventId != null) url.searchParams.set('mse', String(correlation.mobileScanEventId));
  url.searchParams.set('scanEvent', correlation.clientEventId);
  return `${url.pathname}${url.search}${url.hash}`;
}
