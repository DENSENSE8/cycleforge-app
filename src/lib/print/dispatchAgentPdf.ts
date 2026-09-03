/**
 * NAS media agent PDF dispatch for outbound pack documents.
 * Pushes pdf_base64 to POST /print on the office agent (same token as photo writes).
 *
 * Env mirrors `nasAgentUrl` / `nasAgentToken` in nas-agent-client.ts — kept local
 * so this module stays free of the `server-only` / db import graph (unit tests).
 */

export interface OutboundAgentPrintResult {
  ok: boolean;
  dispatched: boolean;
  jobId?: string;
  queue?: string;
  error?: string;
  reason?: 'NO_AGENT' | 'HTTP_ERROR' | 'THREW';
}

function agentBaseUrl(): string {
  return (process.env.NAS_AGENT_URL || '').trim().replace(/\/+$/, '');
}

function agentToken(): string {
  return (process.env.NAS_AGENT_TOKEN || process.env.NAS_RW_TOKEN || '').trim();
}

export function isPrintAgentConfigured(): boolean {
  return Boolean(agentBaseUrl() && agentToken());
}

export async function dispatchAgentPdf(input: {
  title: string;
  pdfBase64: string;
  documentType: 'shipping_label' | 'packing_slip' | 'manual';
  /** Optional CUPS queue override (must be allowlisted on the agent). */
  queue?: string | null;
  source?: string;
}): Promise<OutboundAgentPrintResult> {
  const base = agentBaseUrl();
  const token = agentToken();
  if (!base || !token) {
    return {
      ok: false,
      dispatched: false,
      reason: 'NO_AGENT',
      error: 'NAS_AGENT_URL / NAS_AGENT_TOKEN not configured',
    };
  }

  try {
    const res = await fetch(`${base}/print`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-agent-token': token,
      },
      body: JSON.stringify({
        title: input.title,
        documentType: input.documentType,
        pdfBase64: input.pdfBase64,
        ...(input.queue ? { queue: input.queue } : {}),
        source: input.source ?? 'cycleforge.outbound',
      }),
      cache: 'no-store',
    });

    const text = await res.text().catch(() => '');
    let parsed: {
      ok?: boolean;
      dispatched?: boolean;
      jobId?: string;
      queue?: string;
      error?: string;
    } = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = {};
    }

    if (!res.ok || !parsed.ok) {
      return {
        ok: false,
        dispatched: false,
        reason: 'HTTP_ERROR',
        queue: parsed.queue,
        error:
          parsed.error ||
          `print agent HTTP ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    return {
      ok: true,
      dispatched: Boolean(parsed.dispatched ?? true),
      jobId: parsed.jobId,
      queue: parsed.queue,
    };
  } catch (err) {
    return {
      ok: false,
      dispatched: false,
      reason: 'THREW',
      error: err instanceof Error ? err.message : 'print agent dispatch threw',
    };
  }
}
