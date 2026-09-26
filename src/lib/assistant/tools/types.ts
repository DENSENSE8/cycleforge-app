/** Assistant read-tool registry — shared shapes (plan §3.1). */

import type { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';
import type { PermissionString } from '@/lib/auth/permissions-shared';

export interface AssistantToolCtx {
  organizationId: OrgId;
  staffId: number | null;
  /** The caller's resolved permission set (from AuthContext). */
  permissions: ReadonlySet<string>;
}

export interface AssistantToolQueryResult {
  rows: Array<Record<string, unknown>>;
}

/** Injected DB seam — defaults to tenantQuery (GUC + explicit org predicate). */
export interface AssistantToolDeps {
  query: (orgId: OrgId, text: string, params?: ReadonlyArray<unknown>) => Promise<AssistantToolQueryResult>;
  /**
   * Optional search / ticket collaborators for tools that wrap existing domain
   * helpers (hybridSearch, searchAllEntities, resolveSupportTicketToReceiving).
   * Defaults live on each tool so callers that only fake `query` stay valid.
   */
  hybridEntitySearch?: (
    orgId: OrgId,
    args: { query: string; entityTypes?: string[]; limit?: number },
  ) => Promise<unknown>;
  exactIdSerialSearch?: (
    orgId: OrgId,
    args: { query: string; limit?: number },
  ) => Promise<unknown>;
  resolveSupportTicket?: (
    orgId: OrgId,
    scanValue: string,
  ) => Promise<{
    receivingId: number;
    lineId?: number;
    supportTicketId: number;
  } | null>;
  getSupportTicket?: (
    orgId: OrgId,
    ticketId: number,
  ) => Promise<{
    id: number;
    provider: string;
    externalTicketId: string | null;
    subjectCache: string | null;
    statusCache: string | null;
  } | null>;

  /** Tool-forge collaborators. */
  toolForgeDedupe?: (orgId: OrgId, prompt: string) => Promise<unknown>;
  toolForgeDecide?: (orgId: OrgId, input: unknown) => Promise<unknown>;
  toolForgeValidate?: (orgId: OrgId, files: ReadonlyArray<{ path: string; contents: string }>) => Promise<unknown>;
  toolForgeHandoff?: (orgId: OrgId, input: unknown) => Promise<unknown>;
}

export interface AssistantToolDef<Schema extends z.ZodTypeAny = z.ZodTypeAny, Out = unknown> {
  name: string;
  /** Written for the model — say what questions this answers and what comes back. */
  description: string;
  /** Permission required to invoke (checked against ctx.permissions). */
  permission: PermissionString;
  inputSchema: Schema;
  run: (input: z.infer<Schema>, ctx: AssistantToolCtx, deps: AssistantToolDeps) => Promise<Out>;
}

export type AssistantToolRunResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; code: 'unknown_tool' | 'forbidden' | 'invalid_input' | 'tool_error' };
