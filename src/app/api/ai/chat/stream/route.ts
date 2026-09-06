/**
 * AI Chat — STREAMING endpoint (Server-Sent Events).
 *
 * Mirrors the routing logic of ../route.ts (local-ops resolver → Bose RAG →
 * Hermes gateway) but streams the assistant answer token-by-token so the UI
 * can render text as it arrives instead of waiting 60-80s for one blob.
 *
 * Event protocol (text/event-stream), one JSON payload per `data:` line:
 *   event: meta      { mode, sessionId }
 *   event: step      { label }                 // coarse progress hints
 *   event: delta     { text }                  // incremental assistant text
 *   event: analysis  { ...AiStructuredAnswer } // structured card (local/rag/hybrid)
 *   event: error     { message }
 *   event: done      { mode }
 *
 * Instant/structured modes (local_ops, rag) don't stream from the model — we
 * emit their full text as a single delta followed by the analysis + done.
 */
import { NextRequest } from 'next/server';
import { detectIntents } from '@/lib/ai/intent-router';
import { queryNemoClawRag } from '@/lib/ai/nemoclaw-rag';
import { checkRateLimitForOrg } from '@/lib/api-guard';
import { persistChatMessage, setSessionTitle } from '@/lib/ai/chat-persistence';
import { generateSessionTitle } from '@/lib/ai/session-title';
import { AiFailoverError, postToAiProvider } from '@/lib/ai/failover';
import type { OrgId } from '@/lib/tenancy/constants';
import type { AiStructuredAnswer } from '@/lib/ai/types';
import { enrichAssistantTurn } from '@/lib/assistant/enrich-turn';
import { withAuth } from '@/lib/auth/withAuth';

export const runtime = 'nodejs';

type AiChatBody = { sessionId?: string; message?: string };

const CHAT_SYSTEM_PROMPT =
  'You are the Cycle Forge operations assistant. Staff ask about ' +
  'orders, stock, staff pace, receiving, and repairs. Keep answers ' +
  'concrete and numeric, 1-4 sentences. Use ISO Pacific dates. Call ' +
  'tools for fresh data. When you list multiple records (orders, ' +
  'shipments, repairs, SKUs), do NOT write a long run-on paragraph — ' +
  'output a compact GitHub-flavored Markdown table, one record per ' +
  'row, with short columns (e.g. Order | Product | Date | Status). ' +
  'Put each order or tracking ID in its own cell verbatim so it can ' +
  'be linked. Lead with a one-line count, then the table.';

/**
 * The request body, built PER ATTEMPT — `model` is provider-specific, so a
 * fall-forward must not replay the previous provider's model name.
 */
function chatBody(model: string, userMessage: string) {
  return {
    model,
    messages: [
      { role: 'system', content: CHAT_SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    stream: true,
    temperature: 0.3,
    max_tokens: 2048,
  };
}

const encoder = new TextEncoder();
function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Incremental `<think>…</think>` stripper. The model may interleave reasoning
 * blocks; we never want those in the visible answer. Handles tags split across
 * stream chunks by retaining a small tail when a partial tag is possible.
 */
function createThinkStripper() {
  let inside = false;
  let carry = '';
  const OPEN = '<think>';
  const CLOSE = '</think>';
  return (chunk: string): string => {
    let buf = carry + chunk;
    carry = '';
    let out = '';
    while (buf.length > 0) {
      if (!inside) {
        const open = buf.indexOf(OPEN);
        if (open === -1) {
          // keep a tail that could be the start of an OPEN tag split mid-chunk
          const keep = Math.max(0, buf.length - (OPEN.length - 1));
          out += buf.slice(0, keep);
          carry = buf.slice(keep);
          break;
        }
        out += buf.slice(0, open);
        buf = buf.slice(open + OPEN.length);
        inside = true;
      } else {
        const close = buf.indexOf(CLOSE);
        if (close === -1) {
          const keep = Math.max(0, buf.length - (CLOSE.length - 1));
          carry = buf.slice(keep);
          break;
        }
        buf = buf.slice(close + CLOSE.length);
        inside = false;
      }
    }
    return out;
  };
}

export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rate = await checkRateLimitForOrg({
    headers: req.headers,
    routeKey: 'ai-chat',
    limit: Number(process.env.AI_CHAT_RATE_LIMIT || 25),
    windowMs: 60 * 1000,
    organizationId: ctx.organizationId,
  });
  if (!rate.ok) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again shortly.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = (await req.json().catch(() => ({}))) as AiChatBody;
  const sessionId = body.sessionId;
  const message = body.message;
  if (!sessionId || typeof sessionId !== 'string') {
    return new Response(JSON.stringify({ error: 'sessionId is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (!message || typeof message !== 'string' || !message.trim()) {
    return new Response(JSON.stringify({ error: 'message is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const trimmedMessage = message.trim();
  const organizationId = ctx.organizationId;
  // First message → the session was created with a provisional title. Replace
  // it with an AI summary in the background; the chat turn never waits on it.
  void persistChatMessage({ organizationId, sessionId, role: 'user', content: trimmedMessage })
    .then(async ({ created }) => {
      if (!created) return;
      const title = await generateSessionTitle(organizationId as OrgId, trimmedMessage);
      await setSessionTitle(organizationId, sessionId, title);
    })
    .catch(() => {});

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(sse(event, data));
      // keep-alive comments so proxies don't drop a long idle connection
      const keepAlive = setInterval(() => {
        try { controller.enqueue(encoder.encode(': ping\n\n')); } catch { /* closed */ }
      }, 15_000);

      try {
        // 1. Shared pre-loop: local_ops short-circuit OR live DB enrichment
        send('step', { label: 'Checking local ops data' });
        const prepared = await enrichAssistantTurn(
          organizationId,
          trimmedMessage,
          undefined,
          null,
          ctx.staffId,
        );

        if (prepared.kind === 'local_ops') {
          const localResolution = prepared.resolution;
          send('meta', { mode: 'local_ops', sessionId });
          send('delta', { text: localResolution.reply });
          send('analysis', localResolution.analysis);
          send('done', { mode: 'local_ops' });
          void persistChatMessage({ organizationId, sessionId, role: 'assistant', content: localResolution.reply, mode: 'local_ops', analysis: localResolution.analysis });
          return;
        }

        const intents = prepared.intents.length > 0 ? prepared.intents : detectIntents(trimmedMessage);

        // 2. Bose manual RAG intercept (Hermes path only)
        if (intents.includes('bose_manual')) {
          send('step', { label: 'Searching Bose service manuals' });
          try {
            const ragResult = await queryNemoClawRag(trimmedMessage);
            if (ragResult.answer) {
              const topScore = ragResult.chunks[0]?.score;
              const confidence =
                typeof topScore === 'number'
                  ? topScore >= 0.7 ? 'high' : topScore >= 0.4 ? 'medium' : 'low'
                  : 'medium';
              const analysis: AiStructuredAnswer = {
                kind: 'repair_diagnostics',
                title: 'Bose Service Manual Reference',
                summary: ragResult.answer,
                confidence,
                modeLabel: 'Bose Manual RAG',
                sources: ragResult.sources.map((src, i) => ({ id: `rag-src-${i}`, label: src, detail: `Source: ${src}` })),
                followUps: [
                  'What parts are needed for this repair?',
                  'Show the wiring diagram for this model',
                  'What are the specs for this speaker?',
                  'Are there known issues with this model?',
                ],
              };
              send('meta', { mode: 'rag', sessionId });
              send('delta', { text: ragResult.answer });
              send('analysis', analysis);
              send('done', { mode: 'rag' });
              void persistChatMessage({ organizationId, sessionId, role: 'assistant', content: ragResult.answer, mode: 'rag', analysis });
              return;
            }
          } catch {
            // non-fatal — fall through to Hermes
          }
        }

        // 3. Stream Hermes with the already-enriched user turn
        send('step', { label: 'Pulling live warehouse data' });
        const enrichedMessage = prepared.userMessage;

        send('meta', { mode: prepared.intents.length > 0 ? 'hybrid' : 'assistant', sessionId });
        send('step', { label: 'Asking the assistant' });

        // Per-org provider chain with failover (local-first by default). A
        // cold or unreachable local box falls forward to cloud here rather
        // than ending the turn — the whole point of the inversion.
        //
        // Unconfigured / whole-chain-down is a first-class in-protocol answer,
        // not a thrown fetch at a default URL: this stream has already emitted
        // `meta`, so the client is listening for `error`/`done` and would
        // otherwise hang on a dead socket.
        let hermesRes: Response;
        let servedBy: string;
        try {
          const attempt = await postToAiProvider(organizationId as OrgId, 'chat', {
            path: '/chat/completions',
            headers: {
              'X-Hermes-Session-Id': sessionId,
              'X-Source': 'cycle-forge',
            },
            // Rebuilt per attempt: falling forward to another provider is also
            // falling forward to a different model name.
            buildBody: (config) => chatBody(config.model, enrichedMessage),
            body: null,
            // Streaming needs the ORIGINAL 3-minute budget, not the helper's
            // per-provider default. `AbortSignal.timeout` bounds the whole
            // fetch — body included — so a 45s local budget would guillotine a
            // long answer mid-sentence: at the measured ~17 tok/s a 2048-token
            // reply runs past two minutes. A genuinely dead endpoint still
            // fails over fast, because that surfaces as a network error rather
            // than as this timeout.
            timeoutMs: 180_000,
          });
          hermesRes = attempt.res;
          servedBy = attempt.served.source;
          if (attempt.demoted.length) {
            console.warn(
              `[ai-chat-stream] fell forward to ${servedBy} past ${attempt.demoted
                .map((d) => d.source)
                .join(', ')}`,
            );
          }
        } catch (err) {
          send('error', {
            message:
              err instanceof AiFailoverError && err.attempts.length
                ? `No AI provider could answer (tried ${err.attempts
                    .map((a) => a.source)
                    .join(', ')}). Check Settings → AI.`
                : 'No AI chat provider is connected for this workspace. Connect one in Settings → AI.',
          });
          send('done', { mode: 'assistant' });
          return;
        }

        if (!hermesRes.ok || !hermesRes.body) {
          const errBody = await hermesRes.text().catch(() => '');
          console.error(
            `[ai-chat-stream] provider error (source=${servedBy}):`,
            hermesRes.status,
            errBody.slice(0, 300),
          );
          send('error', {
            message: `The AI provider returned ${hermesRes.status} (${servedBy}).`,
          });
          send('done', { mode: 'assistant' });
          return;
        }

        const strip = createThinkStripper();
        const reader = hermesRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assembled = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const json = JSON.parse(payload);
              const piece: string = json?.choices?.[0]?.delta?.content || '';
              if (!piece) continue;
              const visible = strip(piece);
              if (visible) {
                assembled += visible;
                send('delta', { text: visible });
              }
            } catch { /* ignore non-JSON keep-alives */ }
          }
        }

        const finalText = assembled.trim();
        // local_ops answers short-circuit above (early return), so this path
        // never carries a local analysis — mode is plain 'assistant'.
        send('done', { mode: 'assistant' });
        void persistChatMessage({
          organizationId, sessionId, role: 'assistant',
          content: finalText || 'No response received.',
          mode: 'assistant',
          analysis: null,
        });
      } catch (err: unknown) {
        const messageText = err instanceof Error ? err.message : 'Chat request failed';
        console.error('[ai-chat-stream] error:', messageText);
        try { send('error', { message: messageText }); send('done', { mode: 'assistant' }); } catch { /* closed */ }
      } finally {
        clearInterval(keepAlive);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}, { permission: 'dashboard.view', feature: 'aiChat' });
