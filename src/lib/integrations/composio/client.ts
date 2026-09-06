/**
 * Composio Platform client + session cache.
 *
 * ## Why Composio and not Nango
 *
 * Nango (`src/lib/integrations/nango.ts`) stays the broker for COMMERCE
 * connectors — Zoho, marketplaces, carriers — where this app owns the sync
 * loop and the payload shape. Composio owns AGENT-FACING productivity apps
 * (Google Docs / Drive, Gmail) for one reason: those toolkits ship ~90 (Drive)
 * and ~43 (Docs) tools already described as LLM function schemas, which is
 * exactly what `src/lib/assistant/agent-loop.ts` consumes. Hand-authoring
 * those schemas against a raw OAuth proxy is the work Composio removes.
 * One broker per job; neither reaches into the other's providers.
 *
 * ## Identity
 *
 * A Composio session is scoped to ONE application user, and the connection is
 * the staffer's OWN Google account — so the session user id must be stable and
 * globally unique across tenants. `staff.id` alone is org-scoped and would
 * collide, so `composioUserId` keys on `<organizationId>:<staffId>`, both from
 * the authenticated `AssistantToolCtx`, never from model input.
 *
 * ## Managed auth, app-side handoff
 *
 * `manageConnections: false`: this app hands the operator the Connect Link as
 * an in-chat PILL (`request_connection` UI tool -> `ConnectAppPill`) rather
 * than letting Composio's meta tools negotiate it inside chat text. No
 * provider OAuth flow is built here — `session.authorize()` returns the link,
 * which is the documented path.
 */

import { Composio } from '@composio/core';
import type { AssistantToolCtx } from '@/lib/assistant/tools/types';

/**
 * The toolkits this app will ever ask for. A closed list, not a convenience: a
 * session created over the whole catalogue would let the model discover and
 * authorize anything Composio supports, which is not a decision an assistant
 * tool may make on an operator's behalf.
 */
export const COMPOSIO_TOOLKITS = ['googledocs', 'googledrive', 'gmail'] as const;
export type ComposioToolkit = (typeof COMPOSIO_TOOLKITS)[number];

/** Operator-facing names. The slug is wire vocabulary, never UI copy. */
export const COMPOSIO_TOOLKIT_LABELS: Readonly<Record<ComposioToolkit, string>> = {
  googledocs: 'Google Docs',
  googledrive: 'Google Drive',
  gmail: 'Gmail',
};

// ─── The narrow port we depend on ────────────────────────────────────────────
// Only the four members this app calls. Naming them here (rather than
// re-exporting the SDK's 3-generic `Session`) keeps the contract readable and
// makes an SDK signature change a compile error at ONE boundary.

export interface ComposioConnectionRequest {
  /** Connected-account id, present from INITIATED onward. */
  id: string;
  /** INITIATED until the operator finishes consent; the SDK leaves it optional. */
  status?: string | undefined;
  /**
   * The Connect Link. Nullable by SDK contract — a toolkit that needs no auth,
   * or an account already authorized, yields a request with nothing to open.
   * Callers MUST treat null as "no button to hand over", never as an empty href.
   */
  redirectUrl?: string | null | undefined;
}

export interface ComposioToolkitState {
  slug: string;
  name: string;
  connection?:
    | { isActive: boolean; connectedAccount?: { id: string; status: string } | undefined }
    | undefined;
}

export interface ComposioExecuteResponse {
  successful?: boolean;
  data?: unknown;
  error?: unknown;
}

export interface ComposioStaffSession {
  readonly sessionId: string;
  authorize(toolkit: string, options?: { callbackUrl?: string }): Promise<ComposioConnectionRequest>;
  toolkits(): Promise<{ items: ComposioToolkitState[] }>;
  execute(toolSlug: string, args?: Record<string, unknown>): Promise<ComposioExecuteResponse>;
}

// ─── Configuration ───────────────────────────────────────────────────────────

export class ComposioNotConfiguredError extends Error {
  constructor() {
    super('Composio is not configured for this deployment (COMPOSIO_API_KEY is unset).');
    this.name = 'ComposioNotConfiguredError';
  }
}

export function isComposioConfigured(): boolean {
  const key = process.env.COMPOSIO_API_KEY;
  return typeof key === 'string' && key.trim().length > 0;
}

let client: Composio | null = null;

/**
 * The SDK reads `COMPOSIO_API_KEY` from the environment itself — the key is
 * never passed inline, logged, or echoed. A missing key throws a typed error so
 * a calling tool can answer "not configured" instead of 500ing the turn.
 */
export function composioClient(): Composio {
  if (!isComposioConfigured()) throw new ComposioNotConfiguredError();
  client ??= new Composio();
  return client;
}

/** Globally-unique, stable session identity for one staffer of one tenant. */
export function composioUserId(ctx: Pick<AssistantToolCtx, 'organizationId' | 'staffId'>): string {
  if (ctx.staffId === null) {
    throw new Error('Composio needs a staff identity: a connection belongs to a person, not an org.');
  }
  return `${ctx.organizationId}:${ctx.staffId}`;
}

/**
 * Sessions are cached per user with a TTL, because `composio.create` is a
 * network round trip and one per chat message would add a hop to every turn.
 * The TTL is what lets a connection authorized in another tab be picked up
 * without a redeploy.
 */
const SESSION_TTL_MS = 5 * 60 * 1000;
const sessions = new Map<string, { session: ComposioStaffSession; at: number }>();

export async function composioSessionFor(
  ctx: Pick<AssistantToolCtx, 'organizationId' | 'staffId'>,
): Promise<ComposioStaffSession> {
  const userId = composioUserId(ctx);
  const cached = sessions.get(userId);
  if (cached && Date.now() - cached.at < SESSION_TTL_MS) return cached.session;
  const session: ComposioStaffSession = await composioClient().create(userId, {
    toolkits: [...COMPOSIO_TOOLKITS],
    manageConnections: false,
  });
  sessions.set(userId, { session, at: Date.now() });
  return session;
}

/** Drop a cached session — called after a connection lands so status re-reads. */
export function invalidateComposioSession(
  ctx: Pick<AssistantToolCtx, 'organizationId' | 'staffId'>,
): void {
  sessions.delete(composioUserId(ctx));
}
