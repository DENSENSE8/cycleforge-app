/**
 * Connection state + the immediate Connect Link handoff.
 *
 * The rule this file exists to enforce: **an operator never learns about a
 * missing connection in a second turn.** Any Composio-backed tool that needs
 * an app the staffer has not authorized returns `needs_connection` WITH the
 * live Connect Link in the same result, so the model raises one
 * `request_connection` pill and the person clicks it immediately. No "you need
 * to connect Google Docs first, shall I get you a link?" round trip.
 *
 * `session.authorize()` is what mints that link (Composio-hosted Connect Link,
 * `https://connect.composio.dev/link/...`). This app never builds a provider
 * OAuth flow.
 */

import {
  COMPOSIO_TOOLKIT_LABELS,
  type ComposioToolkit,
  composioSessionFor,
  type ComposioStaffSession,
} from './client';
import type { AssistantToolCtx } from '@/lib/assistant/tools/types';

export type ComposioActor = Pick<AssistantToolCtx, 'organizationId' | 'staffId'>;

export interface ConnectionStatus {
  toolkit: ComposioToolkit;
  label: string;
  connected: boolean;
  connectedAccountId: string | null;
}

/**
 * Where Composio sends the operator after they authorize. Absolute by
 * requirement — Composio redirects the browser, so a relative path cannot
 * work. `NEXT_PUBLIC_APP_URL` is the app's existing public-origin variable.
 */
function connectCallbackUrl(toolkit: ComposioToolkit): string | undefined {
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (!origin) return undefined;
  return `${origin}/api/integrations/composio/callback?toolkit=${encodeURIComponent(toolkit)}`;
}

export async function listConnectionStatus(actor: ComposioActor): Promise<ConnectionStatus[]> {
  const session = await composioSessionFor(actor);
  const { items } = await session.toolkits();
  return items.map((item) => ({
    toolkit: item.slug as ComposioToolkit,
    label: COMPOSIO_TOOLKIT_LABELS[item.slug as ComposioToolkit] ?? item.name,
    connected: item.connection?.isActive === true,
    connectedAccountId: item.connection?.connectedAccount?.id ?? null,
  }));
}

export interface ConnectHandoff {
  toolkit: ComposioToolkit;
  label: string;
  /** The Connect Link to hand the operator right now. */
  connectUrl: string;
  connectionId: string;
}

/**
 * Mint a Connect Link for one toolkit. Callers that already hold a session
 * pass it in so a single tool call does not create two.
 *
 * Composio may return a request with no `redirectUrl` (a no-auth toolkit, or an
 * account already authorized). That is reported as `unavailable` rather than
 * smoothed over — a pill with an empty href is worse than an honest error.
 */
export type ConnectAttempt =
  | { ok: true; handoff: ConnectHandoff }
  | { ok: false; toolkit: ComposioToolkit; label: string; reason: string };

export async function startConnection(
  actor: ComposioActor,
  toolkit: ComposioToolkit,
  session?: ComposioStaffSession,
): Promise<ConnectAttempt> {
  const live = session ?? (await composioSessionFor(actor));
  const request = await live.authorize(toolkit, { callbackUrl: connectCallbackUrl(toolkit) });
  const label = COMPOSIO_TOOLKIT_LABELS[toolkit];
  if (typeof request.redirectUrl !== 'string' || request.redirectUrl.length === 0) {
    return {
      ok: false,
      toolkit,
      label,
      reason: `Composio returned no authorization link for ${label} (connection ${request.id}, status ${request.status ?? 'unknown'}).`,
    };
  }
  return {
    ok: true,
    handoff: { toolkit, label, connectUrl: request.redirectUrl, connectionId: request.id },
  };
}

export type ToolkitAccess =
  | { ready: true; session: ComposioStaffSession }
  | { ready: false; attempt: ConnectAttempt };

/**
 * The gate every Composio-backed tool calls first.
 *
 * Connected → the session, execute immediately. Not connected → a Connect
 * Link, in the SAME result, so the answer to "read my ops doc" is a button
 * rather than a second question.
 */
export async function requireToolkit(
  actor: ComposioActor,
  toolkit: ComposioToolkit,
): Promise<ToolkitAccess> {
  const session = await composioSessionFor(actor);
  const { items } = await session.toolkits();
  const state = items.find((item) => item.slug === toolkit);
  if (state?.connection?.isActive === true) return { ready: true, session };
  return { ready: false, attempt: await startConnection(actor, toolkit, session) };
}

/**
 * Composio tool results arrive as `{ successful, data, error }`. Normalise to
 * a discriminated result so tools never hand the model a half-failed payload
 * it will narrate as success.
 */
export type ComposioCallResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string };

export async function executeComposioTool(
  session: ComposioStaffSession,
  toolSlug: string,
  args: Record<string, unknown>,
): Promise<ComposioCallResult> {
  const response = await session.execute(toolSlug, args);
  if (response.successful === false) {
    const error = typeof response.error === 'string' ? response.error : `${toolSlug} failed`;
    return { ok: false, error };
  }
  return { ok: true, data: response.data ?? null };
}
