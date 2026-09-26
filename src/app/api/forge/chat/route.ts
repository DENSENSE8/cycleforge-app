import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  validateUIMessages,
  stepCountIs,
} from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { withAuth } from '@/lib/auth/withAuth';
import { resolveOrgAiConfig } from '@/lib/ai/org-provider';
import { createPlanTools, defaultPlanToolsDeps } from '@/lib/master-plan/tools/plan-tools';
import { syncMasterPlanToOpsPlans } from '@/lib/master-plan/ops-plans-bridge';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import pool from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SYSTEM_PROMPT = `You are the Cycle Forge plan agent on the /forge dashboard.
You manage the shared agentic-loop master plan — a live MDX document containing
<TicketStatus status="…" ticketId="…" href="…" /> tags that every staff dashboard
and the local sync daemon see in real time.

Rules:
- Ticket statuses are ONLY: pending | in-progress | deployed. Never invent others.
- Always call read_master_plan before mutating, so you act on current state.
- Use mutate_master_plan to flip a ticket's status; include resolutionCommit
  (a git SHA) only when marking a ticket deployed.
- After a mutation, confirm to the user what changed (previous → new status).
- Keep answers short and operational; this is a warehouse ops dashboard.`;

/** POST /api/forge/chat — Vercel AI SDK plan-agent (ALP-3.4). */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    const raw = await req.json().catch(() => ({}));
    const rawMessages = Array.isArray((raw as { messages?: unknown[] })?.messages)
      ? (raw as { messages: unknown[] }).messages
      : null;
    if (!rawMessages || rawMessages.length === 0 || rawMessages.length > 200) {
      return NextResponse.json({ success: false, error: 'messages[] required (1–200)' }, { status: 400 });
    }

    const cfg = await resolveOrgAiConfig(ctx.organizationId, 'chat');
    if (!cfg) {
      return NextResponse.json(
        { success: false, error: 'AI chat is not configured for this workspace' },
        { status: 503 },
      );
    }

    const canManage = ctx.permissions.has('operations.plans.manage');
    const allTools = createPlanTools(
      { orgId: ctx.organizationId, staffId: ctx.staffId },
      defaultPlanToolsDeps({
        audit: async (entry) => {
          await recordAudit(pool, ctx, req, {
            source: 'forge-plan-agent',
            action: AUDIT_ACTION.MASTER_PLAN_TICKET_STATUS,
            entityType: AUDIT_ENTITY.MASTER_PLAN,
            entityId: entry.ticketId,
            before: { status: entry.from },
            after: { status: entry.to, resolutionCommit: entry.resolutionCommit ?? null },
            method: 'manual',
          });
        },
        // Keep the ops-plans projection (staff plan tables) in step with the
        // CRDT truth — fire-and-forget, never blocks the stream.
        onMutated: (toolCtx, mdx) => {
          after(() =>
            syncMasterPlanToOpsPlans(toolCtx.orgId, mdx).catch((err) =>
              console.error('[forge-chat] ops-plans bridge sync failed:', err),
            ),
          );
        },
      }),
    );
    const tools = canManage ? allTools : { read_master_plan: allTools.read_master_plan };

    const messages = await validateUIMessages({ messages: rawMessages });

    const provider = createOpenAICompatible({
      name: 'cycle-forge-ai',
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
      // Endpoint-level auth (Cloudflare Access on a tunnelled self-hosted
      // model), applied after the apiKey bearer — never a replacement for it.
      ...(cfg.headers ? { headers: cfg.headers } : {}),
    });

    const result = streamText({
      model: provider.chatModel(cfg.model),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(6),
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    });
  } catch (error: unknown) {
    console.error('Error in POST /api/forge/chat:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Chat failed' },
      { status: 500 },
    );
  }
}, { permission: 'operations.plans.view' });
