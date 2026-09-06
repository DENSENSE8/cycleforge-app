/**
 * Composio-backed assistant tools — the staffer's own Google apps.
 *
 * These are registered in `ASSISTANT_TOOLS` like every other verb, so they go
 * through `runAssistantTool`'s one chokepoint: unknown-tool → permission →
 * zod → run, with the actor taken from the authenticated ctx and never from
 * model input. The connection is per PERSON (`<orgId>:<staffId>`), so one
 * staffer's tool call can never reach another's Drive.
 *
 * ## The handoff law
 *
 * Every tool here answers a missing connection with `status:
 * 'needs_connection'` AND a live Connect Link in the same result. The model's
 * job is then to call `request_connection` once — the operator gets a button in
 * the turn they asked the question, not a follow-up interrogation.
 * `requireToolkit` is what guarantees that; no tool here calls
 * `composioSessionFor` directly.
 *
 * ## Reads only
 *
 * Nothing here writes to Google. Creating or editing a document is a mutation
 * and belongs behind `propose_mutation` so the trust-class chokepoint governs
 * it like every other AI write.
 */

import { z } from 'zod';
import {
  COMPOSIO_TOOLKITS,
  type ComposioStaffSession,
  type ComposioToolkit,
  isComposioConfigured,
} from '@/lib/integrations/composio/client';
import {
  executeComposioTool,
  listConnectionStatus,
  requireToolkit,
  startConnection,
} from '@/lib/integrations/composio/connections';
import type { AssistantToolCtx, AssistantToolDef } from './types';

/** Body text handed to the model per document — enough to answer, not enough to blow the window. */
const DOC_BODY_LIMIT = 12000;

const toolkitEnum = z.enum(COMPOSIO_TOOLKITS);

type NotConfigured = { status: 'not_configured'; message: string };
type ToolFailure = { status: 'error'; error: string };
type NeedsConnection = {
  status: 'needs_connection';
  app: ComposioToolkit;
  appLabel: string;
  connectUrl: string;
  connectionId: string;
};

function notConfigured(): NotConfigured {
  return {
    status: 'not_configured',
    message:
      'App connections are not enabled on this deployment. Tell the operator to ask an admin to configure Composio; do not offer a workaround.',
  };
}

/**
 * A missing connection and an unconfigured deployment are different answers:
 * the first is one click from working, the second is nothing the operator can
 * fix. Collapsing them would have the model tell a packer to "connect Google
 * Docs" on a deployment with no credential at all.
 */
type ToolkitGate =
  | { kind: 'open'; session: ComposioStaffSession }
  | { kind: 'blocked'; payload: NotConfigured | NeedsConnection | ToolFailure };

async function gate(ctx: AssistantToolCtx, toolkit: ComposioToolkit): Promise<ToolkitGate> {
  if (!isComposioConfigured()) return { kind: 'blocked', payload: notConfigured() };
  const access = await requireToolkit(ctx, toolkit);
  if (access.ready) return { kind: 'open', session: access.session };
  if (!access.attempt.ok) {
    return { kind: 'blocked', payload: { status: 'error', error: access.attempt.reason } };
  }
  const { handoff } = access.attempt;
  return {
    kind: 'blocked',
    payload: {
      status: 'needs_connection',
      app: handoff.toolkit,
      appLabel: handoff.label,
      connectUrl: handoff.connectUrl,
      connectionId: handoff.connectionId,
    },
  };
}

// ─── list_connected_apps ─────────────────────────────────────────────────────

export const listConnectedApps: AssistantToolDef<z.ZodObject<Record<string, never>>> = {
  name: 'list_connected_apps',
  description:
    'Which outside apps the SIGNED-IN staffer has connected (Google Docs, Google Drive, Gmail) and which are still unconnected. Takes no arguments — the identity comes from the session, never from you. Use for "am I connected to Google Docs", "what apps can you reach for me", or before promising work that needs one. Returns { apps: [{ app, label, connected }] }.',
  permission: 'integrations.google.read',
  inputSchema: z.object({}),
  run: async (_input, ctx) => {
    if (!isComposioConfigured()) return notConfigured();
    const apps = await listConnectionStatus(ctx);
    return { apps: apps.map(({ toolkit, label, connected }) => ({ app: toolkit, label, connected })) };
  },
};

// ─── connect_app ─────────────────────────────────────────────────────────────

export const connectApp: AssistantToolDef<z.ZodObject<{ app: typeof toolkitEnum }>> = {
  name: 'connect_app',
  description:
    'Hand the signed-in staffer a link to connect one of their own outside accounts (googledocs | googledrive | gmail). Returns { app, appLabel, connectUrl, alreadyConnected }. When you get a connectUrl, immediately call the `request_connection` UI tool with app, appLabel and connectUrl exactly as returned — that pill IS the answer; never paste the URL as text and never ask permission to fetch it first. Only call this when the person asked to connect, or when another tool told you a connection is missing.',
  permission: 'integrations.google.connect',
  inputSchema: z.object({ app: toolkitEnum }),
  run: async (input, ctx) => {
    if (!isComposioConfigured()) return notConfigured();
    const existing = await listConnectionStatus(ctx);
    const current = existing.find((row) => row.toolkit === input.app);
    if (current?.connected) {
      return {
        app: input.app,
        appLabel: current.label,
        alreadyConnected: true as const,
        connectUrl: null,
      };
    }
    const attempt = await startConnection(ctx, input.app);
    if (!attempt.ok) return { status: 'error' as const, error: attempt.reason };
    return {
      app: attempt.handoff.toolkit,
      appLabel: attempt.handoff.label,
      alreadyConnected: false as const,
      connectUrl: attempt.handoff.connectUrl,
      connectionId: attempt.handoff.connectionId,
    };
  },
};

// ─── search_staff_documents ──────────────────────────────────────────────────

const searchDocumentsInput = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(20).default(10),
});

export const searchStaffDocuments: AssistantToolDef<typeof searchDocumentsInput> = {
  name: 'search_staff_documents',
  description:
    "Search the signed-in staffer's own Google Docs by name or content. Returns { status: 'ok', documents: [{ id, title, url }] } — pass a document id to read_staff_document to get its text. If the person has not connected Google Docs you get { status: 'needs_connection', connectUrl, appLabel }: call `request_connection` with that link straight away instead of asking whether they want to connect.",
  permission: 'integrations.google.read',
  inputSchema: searchDocumentsInput,
  run: async (input, ctx) => {
    const access = await gate(ctx, 'googledocs');
    if (access.kind === 'blocked') return access.payload;
    const result = await executeComposioTool(access.session, 'GOOGLEDOCS_SEARCH_DOCUMENTS', {
      query: input.query,
      max_results: input.limit,
    });
    if (!result.ok) return { status: 'error' as const, error: result.error };
    return { status: 'ok' as const, documents: normaliseDocumentHits(result.data, input.limit) };
  },
};

// ─── read_staff_document ─────────────────────────────────────────────────────

const readDocumentInput = z.object({
  documentId: z.string().min(4).max(120),
});

export const readStaffDocument: AssistantToolDef<typeof readDocumentInput> = {
  name: 'read_staff_document',
  description:
    "Read one of the signed-in staffer's Google Docs as plain text, by document id (from search_staff_documents). Returns { status: 'ok', title, url, body } — render it as a `document` artifact so the text lands on the panel instead of being recited in chat. Long documents are trimmed; say so if `truncated` is true. Not connected yields { status: 'needs_connection', connectUrl }: hand over the link immediately.",
  permission: 'integrations.google.read',
  inputSchema: readDocumentInput,
  run: async (input, ctx) => {
    const access = await gate(ctx, 'googledocs');
    if (access.kind === 'blocked') return access.payload;
    const result = await executeComposioTool(access.session, 'GOOGLEDOCS_GET_DOCUMENT_PLAINTEXT', {
      id: input.documentId,
    });
    if (!result.ok) return { status: 'error' as const, error: result.error };
    const doc = asRecord(result.data);
    const body = firstString(doc, ['plaintext', 'text', 'content', 'body']) ?? '';
    return {
      status: 'ok' as const,
      documentId: input.documentId,
      title: firstString(doc, ['title', 'name']) ?? 'Document',
      url: `https://docs.google.com/document/d/${input.documentId}/edit`,
      body: body.slice(0, DOC_BODY_LIMIT),
      truncated: body.length > DOC_BODY_LIMIT,
    };
  },
};

// ─── Result shaping ──────────────────────────────────────────────────────────
// Composio returns each toolkit's native payload under `data`, and the Docs
// search shape has moved between toolkit versions. These readers accept the
// documented aliases and drop anything unrecognised rather than guessing —
// a wrong id sends the model to the wrong document.

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function firstString(source: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

export interface StaffDocumentHit {
  id: string;
  title: string;
  url: string;
}

export function normaliseDocumentHits(data: unknown, limit: number): StaffDocumentHit[] {
  const root = asRecord(data);
  const candidates = [root.documents, root.files, root.items, root.results, data].find((value) =>
    Array.isArray(value),
  );
  if (!Array.isArray(candidates)) return [];
  const hits: StaffDocumentHit[] = [];
  for (const entry of candidates) {
    const row = asRecord(entry);
    const id = firstString(row, ['id', 'documentId', 'document_id', 'fileId', 'file_id']);
    if (!id) continue;
    hits.push({
      id,
      title: firstString(row, ['title', 'name']) ?? 'Untitled document',
      url: firstString(row, ['webViewLink', 'url', 'link']) ?? `https://docs.google.com/document/d/${id}/edit`,
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
