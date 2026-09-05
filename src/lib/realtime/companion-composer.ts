/**
 * Companion composer — the phone as mic and keyboard for the ONE desk composer.
 *
 * Wire grammar for the desk↔phone `staffstation:{staffId}` bridge
 * (`getStaffStationBridgeChannelName`). Snake_case on the wire like every other
 * bridge payload. Plan: `docs/warehouse-os/PLAN-companion-composer.md`.
 *
 *   desk  → phone   composer_handoff   "here is what I am looking at"
 *   phone → desk    composer_draft     "the field now reads …" (throttled)
 *   phone → desk    composer_submit    "send it"
 *
 * The phone acks a handoff through the existing `station_device_ack` family
 * (`publishDeviceAck(…, 'composer_handoff')`) ONLY when the handoff carries a
 * `request_id` — context pushed while a phone is already present rides with a
 * null id and wants no reply.
 *
 * `seq` is monotonic per phone session. The desk keeps the last applied seq and
 * drops anything older so a slow draft can never overwrite a newer one.
 */

import type { AssistantPageContext } from '@/lib/assistant/context-store';

/** Desk → phone. */
export const COMPANION_HANDOFF_EVENT = 'composer_handoff';
/** Phone → desk, throttled. */
export const COMPANION_DRAFT_EVENT = 'composer_draft';
/** Phone → desk, once per Enter. */
export const COMPANION_SUBMIT_EVENT = 'composer_submit';

/** Trailing-edge throttle for `composer_draft`. Keystroke-rate publishes would flood Ably. */
export const COMPANION_DRAFT_THROTTLE_MS = 150;

/** Presence data the phone enters with on the bridge. */
export const COMPANION_PHONE_PRESENCE = { device: 'phone' } as const;

export type CompanionDraftSource = 'keyboard' | 'voice';

/** The context slice the phone can paint. `skill` is server-side prompt text — never shipped. */
export interface CompanionContext {
  page: string;
  station: string | null;
  mode: string | null;
  selection: { kind: string; id: string | number } | null;
  /** Desk route (pathname + query) so the phone can say where the desk is. */
  route: string;
}

export interface CompanionHandoffPayload {
  request_id: string | null;
  context: CompanionContext;
  sent_at: string;
}

export interface CompanionDraftPayload {
  text: string;
  seq: number;
  source: CompanionDraftSource;
}

export interface CompanionSubmitPayload {
  text: string;
  seq: number;
}

const MAX_TEXT = 8_000;

export function buildCompanionContext(
  ctx: AssistantPageContext | null,
  route: string,
): CompanionContext {
  return {
    page: ctx?.page?.trim() || 'home',
    station: ctx?.station?.trim() || null,
    mode: ctx?.mode?.trim() || null,
    selection: ctx?.selection ? { kind: ctx.selection.kind, id: ctx.selection.id } : null,
    route: route || '/',
  };
}

export function buildCompanionHandoff(
  context: CompanionContext,
  requestId: string | null,
  now: Date = new Date(),
): CompanionHandoffPayload {
  return { request_id: requestId, context, sent_at: now.toISOString() };
}

function str(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Wire → typed. Null when the message is not a handoff we can paint. */
export function parseCompanionHandoff(data: unknown): CompanionHandoffPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const c = d.context;
  if (!c || typeof c !== 'object') return null;
  const cc = c as Record<string, unknown>;
  const page = str(cc.page);
  if (!page) return null;
  let selection: CompanionContext['selection'] = null;
  if (cc.selection && typeof cc.selection === 'object') {
    const s = cc.selection as Record<string, unknown>;
    const kind = str(s.kind);
    const id = typeof s.id === 'number' ? s.id : str(s.id);
    if (kind && id !== null) selection = { kind, id };
  }
  return {
    request_id: str(d.request_id, 128),
    context: {
      page,
      station: str(cc.station),
      mode: str(cc.mode),
      selection,
      route: str(cc.route, 2_000) ?? '/',
    },
    sent_at: str(d.sent_at, 64) ?? '',
  };
}

function parseSeq(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

/** Wire → typed. Text may be empty (the phone cleared the field). */
export function parseCompanionDraft(data: unknown): CompanionDraftPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const seq = parseSeq(d.seq);
  if (seq === null || typeof d.text !== 'string') return null;
  return {
    text: d.text.slice(0, MAX_TEXT),
    seq,
    source: d.source === 'voice' ? 'voice' : 'keyboard',
  };
}

export function parseCompanionSubmit(data: unknown): CompanionSubmitPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const seq = parseSeq(d.seq);
  const text = typeof d.text === 'string' ? d.text.trim().slice(0, MAX_TEXT) : '';
  if (seq === null || !text) return null;
  return { text, seq };
}

/**
 * Desk-side ordering guard. Returns true when `incoming` should be applied and
 * advances the cursor; false drops a stale message. Submit and draft share one
 * cursor because they share one field.
 */
export function createCompanionSeqGuard() {
  let last = -1;
  return {
    accept(incoming: number): boolean {
      if (incoming <= last) return false;
      last = incoming;
      return true;
    },
    reset() {
      last = -1;
    },
  };
}

/** Is this presence member a phone? Desk counts these to paint "paired". */
export function isCompanionPhoneMember(member: { data?: unknown } | null | undefined): boolean {
  const d = member?.data;
  return !!d && typeof d === 'object' && (d as Record<string, unknown>).device === 'phone';
}
