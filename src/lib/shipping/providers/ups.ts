import { estimatedDeliveryInstant } from './estimated-delivery';
import { normalizeUPSStatus, normalizeTrackingNumber } from '../normalize';
import type { CarrierTrackingEvent, CarrierTrackingResult } from '../types';
import { upsActivityInstant, upsActivityLegacyStamp } from '../carrier-event-instant';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { requireCarrierCredentials } from '../carrier-credentials';

// UPS uses one host for both production and the CIE sandbox swap (wwwcie.ups.com).
// Existing behaviour is production-only; expose the base so the subscription
// client builds its URL from the same root.
export const UPS_BASE_URL = process.env.UPS_BASE_URL ?? 'https://onlinetools.ups.com';
const UPS_AUTH_URL = `${UPS_BASE_URL}/security/v1/oauth/token`;
const UPS_TRACK_URL = `${UPS_BASE_URL}/api/track/v1/details`;

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;
// Single in-flight token request shared across concurrent callers — prevents
// N parallel OAuth fan-out during cron sync from triggering UPS rate-limit / 401s.
let tokenInFlight: Promise<string> | null = null;

async function fetchFreshToken(): Promise<string> {
  const [clientId, clientSecret] = requireCarrierCredentials('UPS');

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch(UPS_AUTH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`UPS auth failed: ${res.status} ${body}`);
  }

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 14400) * 1000,
  };
  return tokenCache.token;
}

export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }
  if (forceRefresh) {
    tokenCache = null;
    tokenInFlight = null;
  }
  if (!tokenInFlight) {
    tokenInFlight = fetchFreshToken().finally(() => { tokenInFlight = null; });
  }
  return tokenInFlight;
}

function firstValue<T>(...values: T[]): T | null {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function extractUPSMetadata(payload: any, shipment: any, pkg: any, events: CarrierTrackingEvent[]) {
  const latestEvent = events.find((event) => event.eventOccurredAt) ?? events[0] ?? null;
  const deliveryDate = Array.isArray(pkg?.deliveryDate)
    ? pkg.deliveryDate[0]
    : pkg?.deliveryDate ?? null;

  return {
    source: 'ups-track-v1',
    service: firstValue(
      shipment?.service?.description,
      shipment?.service?.code,
      pkg?.service?.description,
      pkg?.service?.code
    ),
    packageCount: Array.isArray(shipment?.package) ? shipment.package.length : null,
    referenceNumber: firstValue(
      pkg?.referenceNumber?.[0]?.number,
      shipment?.referenceNumber?.[0]?.number
    ),
    deliveryDate: deliveryDate,
    signedBy: firstValue(
      pkg?.deliveryInformation?.receivedBy,
      payload?.trackResponse?.shipment?.[0]?.deliveryDate?.[0]?.receivedByName
    ),
    latestLocation: latestEvent
      ? {
          city: latestEvent.city ?? null,
          state: latestEvent.state ?? null,
          postalCode: latestEvent.postalCode ?? null,
          countryCode: latestEvent.countryCode ?? null,
        }
      : null,
    trackingUrl: `https://www.ups.com/track?track=yes&trackNums=${encodeURIComponent(
      String(pkg?.trackingNumber ?? '')
    )}&loc=en_US&requester=ST/trackdetails`,
  };
}

function buildUPSResultFromPayload(payload: any, shipment: any, pkg: any): CarrierTrackingResult {
  const trackingNumber = normalizeTrackingNumber(
    String(
      pkg?.trackingNumber ??
      shipment?.inquiryNumber?.value ??
      shipment?.inquiryNumber?.number ??
      ''
    )
  );

  if (!trackingNumber) {
    return {
      carrier: 'UPS',
      trackingNumberNormalized: '',
      latestStatusCategory: 'UNKNOWN',
      metadata: {
        source: 'ups-track-v1',
      },
      events: [],
      payload,
    };
  }

  // `currentStatus` carries a 3-digit code and words but usually NO `type` ("160 · We Have Your
  // Package" while the newest activity is type `I`): read it first, then the newest activity's status.
  const currentStatus = pkg?.currentStatus ?? pkg?.activity?.[0]?.status;
  const newestActivity = pkg?.activity?.[0]?.status;
  const fromCurrent = normalizeUPSStatus(currentStatus?.type, currentStatus?.code, currentStatus?.description);
  const latestCategory =
    fromCurrent === 'UNKNOWN' && newestActivity
      ? normalizeUPSStatus(newestActivity.type, newestActivity.code, newestActivity.description)
      : fromCurrent;

  const activities: unknown[] = Array.isArray(pkg?.activity) ? pkg.activity : [];
  const events: CarrierTrackingEvent[] = activities.map((act: any) => {
    const status = act?.status ?? {};
    const addr = act?.location?.address ?? {};
    const occurredAt = upsActivityInstant(act);

    return {
      // Identity keeps the legacy local-as-UTC stamp: stored rows embed it, and
      // the dedupe key (shipment, id, code, instant) must match on re-sync.
      externalEventId:
        [status.code ?? null, upsActivityLegacyStamp(act), addr.city ?? null].filter(Boolean).join(':') || null,
      externalStatusCode: status.code ?? null,
      externalStatusLabel: status.type ?? null,
      externalStatusDescription: status.description ?? null,
      normalizedStatusCategory: normalizeUPSStatus(status.type, status.code, status.description),
      eventOccurredAt: occurredAt,
      city: addr.city ?? null,
      state: addr.stateProvince ?? null,
      postalCode: addr.postalCode ?? null,
      countryCode: addr.countryCode ?? null,
      signedBy: pkg?.deliveryInformation?.receivedBy ?? null,
      payload: act,
    };
  });

  const deliveredEvent = events.find((e) => e.normalizedStatusCategory === 'DELIVERED');
  const latestEventAt = events.map((e) => e.eventOccurredAt).filter(Boolean).sort().reverse()[0] ?? null;

  return {
    carrier: 'UPS',
    trackingNumberNormalized: trackingNumber,
    latestStatusCategory: latestCategory,
    latestStatusCode: currentStatus?.code ?? null,
    latestStatusLabel: currentStatus?.type ?? null,
    latestStatusDescription: currentStatus?.description ?? null,
    latestEventAt,
    deliveredAt: deliveredEvent?.eventOccurredAt ?? null,
    // SDD = scheduled, RDD = rescheduled delivery date (`YYYYMMDD`).
    estimatedDelivery: estimatedDeliveryInstant(
      (Array.isArray(pkg?.deliveryDate) ? pkg.deliveryDate : []).find(
        (d: { type?: string; date?: string }) => d?.type === 'RDD' || d?.type === 'SDD',
      )?.date,
    ),
    metadata: extractUPSMetadata(payload, shipment, pkg, events),
    events,
    payload,
  };
}

export function parseUPSTrackingPayload(payload: any): CarrierTrackingResult | null {
  const shipment = Array.isArray(payload?.trackResponse?.shipment)
    ? payload.trackResponse.shipment[0]
    : payload?.trackResponse?.shipment;
  const pkg = Array.isArray(shipment?.package) ? shipment.package[0] : shipment?.package;

  if (!shipment || !pkg) return null;
  return buildUPSResultFromPayload(payload, shipment, pkg);
}

async function callUpsTrack(normalized: string, token: string): Promise<Response> {
  const transId = safeRandomUUID();
  return fetch(`${UPS_TRACK_URL}/${encodeURIComponent(normalized)}?locale=en_US&returnSignature=false`, {
    headers: {
      Authorization: `Bearer ${token}`,
      transId,
      transactionSrc: 'cycle-forge',
    },
  });
}

export async function trackByNumber(trackingNumber: string): Promise<CarrierTrackingResult> {
  const normalized = normalizeTrackingNumber(trackingNumber);
  let token = await getAccessToken();
  let res = await callUpsTrack(normalized, token);

  // Bust cache + retry once on 401 (token may be revoked earlier than UPS promised).
  if (res.status === 401) {
    token = await getAccessToken(true);
    res = await callUpsTrack(normalized, token);
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After');
    throw Object.assign(new Error('UPS rate limit exceeded'), { code: 'RATE_LIMIT', retryAfter });
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw Object.assign(new Error(`UPS track failed: ${res.status} ${body}`), {
      code: res.status === 404 ? 'NOT_FOUND'
          : res.status === 403 ? 'ACCESS_CONTROL'
          : res.status === 401 ? 'AUTH_ERROR'
          : 'HTTP_ERROR',
    });
  }

  const payload = await res.json();
  const result = parseUPSTrackingPayload(payload);
  if (!result) {
    return {
      carrier: 'UPS',
      trackingNumberNormalized: normalized,
      latestStatusCategory: 'UNKNOWN',
      metadata: {
        source: 'ups-track-v1',
      },
      events: [],
      payload,
    };
  }
  return result;
}
