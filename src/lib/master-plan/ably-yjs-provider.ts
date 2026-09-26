/** Custom Ably↔Yjs provider (ALP-1.1) — we OWN this protocol; no third-party CRDT host, no unmaintained community bridge (locked decision,… */

import * as Y from 'yjs';
import { safeRandomUUID } from '@/lib/safe-uuid';

/** Event names on the `org:{uuid}:forge:master-plan` channel. */
export const MASTER_PLAN_EVENTS = {
  /** Incremental doc update broadcast: { u: base64, from: clientTag }. */
  update: 'yjs.update',
  /** Join/sync ask: { sv: base64 state vector, from: clientTag }. */
  syncRequest: 'yjs.sync.request',
  /** Targeted reply: { u: base64 diff, sv: base64 responder SV, from, to }. */
  syncResponse: 'yjs.sync.response',
} as const;

export interface MasterPlanMessage {
  data: unknown;
}

/** Minimal slice of an Ably RealtimeChannel the provider needs. */
export interface MasterPlanChannelLike {
  publish(name: string, data: unknown): Promise<void> | void;
  subscribe(name: string, cb: (msg: MasterPlanMessage) => void): Promise<void> | void;
  unsubscribe(name: string, cb: (msg: MasterPlanMessage) => void): void;
}

export function u8ToBase64(u8: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
  let binary = '';
  for (let i = 0; i < u8.length; i += 1) binary += String.fromCharCode(u8[i]);
  return btoa(binary);
}

export function base64ToU8(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const binary = atob(b64);
  const u8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) u8[i] = binary.charCodeAt(i);
  return u8;
}

function randomTag(): string {
  try {
    return safeRandomUUID();
  } catch {
    return `tag-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  }
}

export interface AblyYjsProviderOptions {
  /** Stable identity for echo suppression; defaults to a random UUID. */
  clientTag?: string;
  /** Subscribe-only mode for staff whose Ably capability has no `publish` (plan viewers). */
  readOnly?: boolean;
  /** Local-update batching window in ms (merged via Y.mergeUpdates). */
  flushMs?: number;
  /** Injectable timer for tests. */
  setTimeoutFn?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (t: ReturnType<typeof setTimeout>) => void;
  onError?: (err: unknown, where: string) => void;
}

/** Wires one Y.Doc to one master-plan channel. */
export class MasterPlanAblyProvider {
  readonly clientTag: string;
  readonly readOnly: boolean;

  private readonly doc: Y.Doc;
  private readonly channel: MasterPlanChannelLike;
  private readonly flushMs: number;
  private readonly setTimeoutFn: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly clearTimeoutFn: (t: ReturnType<typeof setTimeout>) => void;
  private readonly onError: (err: unknown, where: string) => void;

  private pending: Uint8Array[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Tracked separately from the timer handle: a synchronous/immediate timer
   * (tests, 0ms flush) runs flush() BEFORE the handle assignment completes,
   * so gating on the handle alone would permanently wedge the queue.
   */
  private flushScheduled = false;
  private destroyed = false;
  /** True once at least one sync.response addressed to us has been applied. */
  synced = false;

  private readonly docUpdateHandler = (update: Uint8Array, origin: unknown) => {
    if (origin === this || this.destroyed || this.readOnly) return;
    this.pending.push(update);
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      this.flushTimer = this.setTimeoutFn(() => this.flush(), this.flushMs);
    }
  };

  private readonly onUpdateMsg = (msg: MasterPlanMessage) => {
    const data = msg?.data as { u?: string; from?: string } | undefined;
    if (!data?.u || data.from === this.clientTag) return;
    try {
      Y.applyUpdate(this.doc, base64ToU8(data.u), this);
    } catch (err) {
      this.onError(err, 'apply-remote-update');
    }
  };

  private readonly onSyncRequestMsg = (msg: MasterPlanMessage) => {
    const data = msg?.data as { sv?: string; from?: string } | undefined;
    if (this.readOnly) return; // answering requires publish capability
    if (!data?.sv || !data.from || data.from === this.clientTag) return;
    try {
      const remoteSv = base64ToU8(data.sv);
      const diff = Y.encodeStateAsUpdate(this.doc, remoteSv);
      void this.channel.publish(MASTER_PLAN_EVENTS.syncResponse, {
        u: u8ToBase64(diff),
        sv: u8ToBase64(Y.encodeStateVector(this.doc)),
        from: this.clientTag,
        to: data.from,
      });
    } catch (err) {
      this.onError(err, 'answer-sync-request');
    }
  };

  private readonly onSyncResponseMsg = (msg: MasterPlanMessage) => {
    const data = msg?.data as { u?: string; sv?: string; from?: string; to?: string } | undefined;
    if (!data?.u || data.from === this.clientTag) return;
    // Responses are targeted; ignore ones meant for other joiners.
    if (data.to && data.to !== this.clientTag) return;
    try {
      Y.applyUpdate(this.doc, base64ToU8(data.u), this);
      this.synced = true;
      // Two-way: if the responder is missing states we hold, broadcast them.
      if (data.sv && !this.readOnly) {
        const theirSv = base64ToU8(data.sv);
        const ourExtra = Y.encodeStateAsUpdate(this.doc, theirSv);
        // A no-diff update still encodes a few structural bytes; skip tiny ones.
        if (ourExtra.length > 3) {
          void this.channel.publish(MASTER_PLAN_EVENTS.update, {
            u: u8ToBase64(ourExtra),
            from: this.clientTag,
          });
        }
      }
    } catch (err) {
      this.onError(err, 'apply-sync-response');
    }
  };

  constructor(doc: Y.Doc, channel: MasterPlanChannelLike, opts: AblyYjsProviderOptions = {}) {
    this.doc = doc;
    this.channel = channel;
    this.clientTag = opts.clientTag ?? randomTag();
    this.readOnly = opts.readOnly ?? false;
    this.flushMs = opts.flushMs ?? 80;
    this.setTimeoutFn = opts.setTimeoutFn ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimeoutFn = opts.clearTimeoutFn ?? ((t) => clearTimeout(t));
    this.onError = opts.onError ?? ((err, where) => console.error(`[master-plan provider] ${where}`, err));
  }

  /** Subscribe to the three protocol events and ask peers for missing state. */
  async connect(): Promise<void> {
    if (this.destroyed) throw new Error('provider destroyed');
    await this.channel.subscribe(MASTER_PLAN_EVENTS.update, this.onUpdateMsg);
    await this.channel.subscribe(MASTER_PLAN_EVENTS.syncRequest, this.onSyncRequestMsg);
    await this.channel.subscribe(MASTER_PLAN_EVENTS.syncResponse, this.onSyncResponseMsg);
    // A React unmount mid-connect (destroy() ran during an await above) must
    // not leave live subscriptions on the shared app-wide Ably client.
    if (this.destroyed) {
      this.detachSubscriptions();
      return;
    }
    this.doc.on('update', this.docUpdateHandler);
    if (!this.readOnly) await this.requestSync();
  }

  private detachSubscriptions(): void {
    try {
      this.channel.unsubscribe(MASTER_PLAN_EVENTS.update, this.onUpdateMsg);
      this.channel.unsubscribe(MASTER_PLAN_EVENTS.syncRequest, this.onSyncRequestMsg);
      this.channel.unsubscribe(MASTER_PLAN_EVENTS.syncResponse, this.onSyncResponseMsg);
    } catch (err) {
      this.onError(err, 'unsubscribe');
    }
  }

  /** Re-broadcast a sync ask (e.g. after a reconnect). No-op in readOnly. */
  async requestSync(): Promise<void> {
    if (this.readOnly) return;
    await this.channel.publish(MASTER_PLAN_EVENTS.syncRequest, {
      sv: u8ToBase64(Y.encodeStateVector(this.doc)),
      from: this.clientTag,
    });
  }

  /** Merge + publish everything queued by local edits (fire-and-forget). */
  flush(): void {
    void this.flushAsync();
  }

  /** Merge + publish queued local edits and AWAIT the publish. */
  async flushAsync(): Promise<void> {
    this.flushScheduled = false;
    if (this.flushTimer != null) {
      this.clearTimeoutFn(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.destroyed || this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    try {
      const merged = batch.length === 1 ? batch[0] : Y.mergeUpdates(batch);
      await this.channel.publish(MASTER_PLAN_EVENTS.update, {
        u: u8ToBase64(merged),
        from: this.clientTag,
      });
    } catch (err) {
      this.onError(err, 'publish-update');
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.flush();
    this.destroyed = true;
    this.doc.off('update', this.docUpdateHandler);
    this.detachSubscriptions();
  }
}
