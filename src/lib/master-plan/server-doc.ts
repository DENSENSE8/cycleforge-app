/**
 * Server-side master-plan doc session (Phase 3 — the plan-agent's write path).
 *
 * The CRDT truth lives across live peers (web clients, the sync daemon); the
 * server holds no durable doc. To mutate, a server route joins the org channel
 * with a SHORT-LIVED Ably Realtime connection (server key), syncs, applies the
 * mutation through the same provider protocol, flushes, and disconnects —
 * every peer (and the daemon → the local file) converges on the edit.
 *
 * If no peer answers within the sync window and the doc is empty, the session
 * seeds from the canonical seed source first (idempotent fixed-clientID seed —
 * see README.md), so a mutation against an empty room still lands on the
 * canonical starter rather than a blank string.
 *
 * Deps-injected for DB-free/network-free unit tests (house pattern).
 */

import type * as Y from 'yjs';
import { getMasterPlanChannel } from '@/lib/realtime/channels';
import { getValidatedAblyApiKey } from '@/lib/realtime/ably-key';
import { MasterPlanAblyProvider, type MasterPlanChannelLike } from './ably-yjs-provider';
import { createMasterPlanYDoc, isMasterPlanEmpty, getMasterPlanText } from './doc';
import { readMasterPlanSeed } from './seed-source';

/**
 * The single org allowed to hold the forge master plan. USAV (org #1) is the
 * dogfood tenant; the plan lives ONLY there. Other tenants must never receive
 * the dogfood content — see the tenancy gate in withMasterPlanDoc.
 */
const DEFAULT_FORGE_ORG = '00000000-0000-0000-0000-000000000001';
export function forgePlanOrgId(env: Record<string, string | undefined> = process.env): string {
  return (env.MASTER_PLAN_ORG_ID || env.FORGE_ORG_ID || DEFAULT_FORGE_ORG).trim().toLowerCase();
}
export function isForgePlanOrg(orgId: string, env: Record<string, string | undefined> = process.env): boolean {
  return orgId.trim().toLowerCase() === forgePlanOrgId(env);
}

export interface MasterPlanSessionHandle {
  channel: MasterPlanChannelLike;
  close: () => Promise<void> | void;
}

export interface MasterPlanServerDeps {
  /** Opens a connected realtime channel for the org (real impl: Ably). */
  openChannel: (orgId: string) => Promise<MasterPlanSessionHandle>;
  /** Canonical seed text for empty-room display bootstrap. */
  readSeed: () => Promise<string>;
  /** How long to wait for peers to answer the sync request. */
  syncWaitMs: number;
  /** Grace after an awaited publish so Ably delivers before we disconnect. */
  flushSettleMs: number;
  sleep: (ms: number) => Promise<void>;
  env: Record<string, string | undefined>;
}

async function openAblyChannel(orgId: string): Promise<MasterPlanSessionHandle> {
  const key = getValidatedAblyApiKey();
  if (!key) throw new Error('ABLY_API_KEY is not configured — master-plan mutations need the server key');
  const AblyMod = await import('ably');
  const Ably = AblyMod.default ?? AblyMod;
  const client = new Ably.Realtime({ key, clientId: 'master-plan-server', echoMessages: false });
  await new Promise<void>((resolve, reject) => {
    client.connection.once('connected', () => resolve());
    client.connection.once('failed', (state: { reason?: { message?: string } }) =>
      reject(new Error(`Ably connection failed: ${state?.reason?.message ?? 'unknown'}`)),
    );
  });
  const channel = client.channels.get(getMasterPlanChannel(orgId));
  return {
    channel: channel as unknown as MasterPlanChannelLike,
    close: () => client.close(),
  };
}

export const defaultMasterPlanServerDeps: MasterPlanServerDeps = {
  openChannel: openAblyChannel,
  readSeed: async () => (await readMasterPlanSeed()).mdx,
  syncWaitMs: 1200,
  flushSettleMs: 120,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  env: process.env,
};

export interface WithMasterPlanDocResult<T> {
  result: T;
  /**
   * True when the room was empty and a read-only display seed was applied
   * LOCALLY (never broadcast) so reads show the canonical starter. Mutations
   * pass `seedForRead: false` and never seed — a mutation on a truly empty
   * room is a no-op, not a fabricated-then-broadcast doc (which would create a
   * fixed-clientID collision / split-brain with the daemon's authoritative
   * seed). The daemon is the SOLE broadcaster of the master-plan seed.
   */
  seeded: boolean;
}

export interface WithMasterPlanDocOptions {
  /**
   * Read paths (true, default) apply the canonical starter LOCALLY to an empty
   * forge-org room purely so the response isn't blank — the seed is never put
   * on the wire (origin = provider), so it can't collide with the daemon.
   * Mutation paths pass false.
   */
  seedForRead?: boolean;
}

/**
 * Join → sync → (optionally local-seed for display) → run `fn(doc)` → flush →
 * leave. `fn` edits the doc synchronously; genuine edits broadcast to all peers
 * before the connection closes. The empty-room display seed is:
 *   1. TENANCY-gated to the configured forge org (non-forge tenants never see
 *      the dogfood plan — closes the cross-tenant leak), and
 *   2. applied with the provider as origin, so it is NOT broadcast and cannot
 *      split-brain with the daemon's seed.
 */
export async function withMasterPlanDoc<T>(
  orgId: string,
  fn: (doc: Y.Doc) => T,
  deps: MasterPlanServerDeps = defaultMasterPlanServerDeps,
  opts: WithMasterPlanDocOptions = {},
): Promise<WithMasterPlanDocResult<T>> {
  const seedForRead = opts.seedForRead ?? true;
  const session = await deps.openChannel(orgId);
  const doc = createMasterPlanYDoc();
  const provider = new MasterPlanAblyProvider(doc, session.channel, {
    clientTag: `server-${Math.random().toString(36).slice(2)}`,
    flushMs: 0,
  });
  try {
    await provider.connect();
    await deps.sleep(deps.syncWaitMs);

    let seeded = false;
    if (seedForRead && isForgePlanOrg(orgId, deps.env) && isMasterPlanEmpty(doc)) {
      const seedText = await deps.readSeed();
      if (seedText.length > 0) {
        // origin = provider → local-only, NEVER broadcast (no split-brain).
        doc.transact(() => getMasterPlanText(doc).insert(0, seedText), provider);
        seeded = true;
      }
    }

    const result = fn(doc);
    // Flush any genuine edits `fn` made, then let the publish reach the wire.
    await provider.flushAsync();
    await deps.sleep(deps.flushSettleMs);
    return { result, seeded };
  } finally {
    provider.destroy();
    await session.close();
    doc.destroy();
  }
}
