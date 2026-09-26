/** ShipStation key health — is this org's ShipStation live on BOTH APIs? */

import type { OrgId } from '@/lib/tenancy/constants';
import type { ShipStationCredentials } from '@/lib/integrations/credentials';
import { createShipStationV2Client } from './client';
import { resolveShipStationCreds } from './config';
import { createShipStationV1Client } from './orders-v1';

export type ShipStationKeyState = 'active' | 'missing' | 'rejected' | 'error';

export interface ShipStationStatus {
  v1: ShipStationKeyState;
  v2: ShipStationKeyState;
  /** Both keys live (an `error` key counts as its last definitive verdict). */
  active: boolean;
  /** ISO timestamp of the probe that produced this result. */
  checkedAt: string;
}

export interface ShipStationStatusDeps {
  resolveCreds(orgId: OrgId): Promise<ShipStationCredentials | null>;
  /** Cheapest authenticated v2 call. Throws an error carrying `httpStatus` on failure. */
  probeV2(apiKey: string): Promise<void>;
  /** Cheapest authenticated v1 call. Throws an error carrying `httpStatus` on failure. */
  probeV1(apiKey: string, apiSecret: string): Promise<void>;
  now(): number;
}

const TTL_MS = 5 * 60_000;
const ERROR_TTL_MS = 30_000;

function classify(err: unknown): ShipStationKeyState {
  const status = (err as { httpStatus?: unknown } | null)?.httpStatus;
  return status === 401 || status === 403 ? 'rejected' : 'error';
}

async function probe(run: () => Promise<void>): Promise<ShipStationKeyState> {
  try {
    await run();
    return 'active';
  } catch (err) {
    return classify(err);
  }
}

export function createShipStationStatusChecker(deps: ShipStationStatusDeps) {
  const cache = new Map<OrgId, { status: ShipStationStatus; expiresAt: number }>();
  /** Last non-error verdict per key — what an `error` probe falls back to. */
  const definitive = new Map<OrgId, { v1?: ShipStationKeyState; v2?: ShipStationKeyState }>();

  async function check(orgId: OrgId, opts: { fresh?: boolean } = {}): Promise<ShipStationStatus> {
    const now = deps.now();
    const hit = cache.get(orgId);
    if (!opts.fresh && hit && hit.expiresAt > now) return hit.status;

    const creds = await deps.resolveCreds(orgId);
    const v1Key = creds?.v1ApiKey;
    const v1Secret = creds?.v1ApiSecret;
    const v2Key = creds?.apiKey;

    const [v1, v2] = await Promise.all([
      v1Key && v1Secret ? probe(() => deps.probeV1(v1Key, v1Secret)) : Promise.resolve<ShipStationKeyState>('missing'),
      v2Key ? probe(() => deps.probeV2(v2Key)) : Promise.resolve<ShipStationKeyState>('missing'),
    ]);

    const last = definitive.get(orgId) ?? {};
    const next = {
      v1: v1 === 'error' ? last.v1 : v1,
      v2: v2 === 'error' ? last.v2 : v2,
    };
    definitive.set(orgId, next);

    const status: ShipStationStatus = {
      v1,
      v2,
      active: next.v1 === 'active' && next.v2 === 'active',
      checkedAt: new Date(now).toISOString(),
    };
    const anyError = v1 === 'error' || v2 === 'error';
    cache.set(orgId, { status, expiresAt: now + (anyError ? ERROR_TTL_MS : TTL_MS) });
    return status;
  }

  /** Drop the cached verdict (credential save/delete). */
  function invalidate(orgId: OrgId): void {
    cache.delete(orgId);
    definitive.delete(orgId);
  }

  return { check, invalidate };
}

const defaultDeps: ShipStationStatusDeps = {
  resolveCreds: resolveShipStationCreds,
  probeV2: async (apiKey) => {
    await createShipStationV2Client(apiKey).listCarriers();
  },
  probeV1: async (apiKey, apiSecret) => {
    await createShipStationV1Client(apiKey, apiSecret).listStores();
  },
  now: () => Date.now(),
};

const defaultChecker = createShipStationStatusChecker(defaultDeps);

export const checkShipStationStatus = defaultChecker.check;
export const invalidateShipStationStatus = defaultChecker.invalidate;
