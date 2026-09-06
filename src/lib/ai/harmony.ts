/**
 * Harmony → OpenAI wire bridge.
 *
 * `gpt-oss` (the base under `adapters/cycleforge-gpt-oss-v1-promoted`, served
 * by `mlx_lm.server` on the Mac as model id `default_model`) does not emit
 * `tool_calls`. The server logs `WARNING - Received tools but model does not
 * support tool calling.` and the intent comes back inside the message CONTENT,
 * in Harmony channel markup. Measured verbatim, 2026-09-06, through
 * `http://127.0.0.1:8080/v1/chat/completions`:
 *
 *   <|channel|>analysis<|message|>We need to answer … We need to call the
 *   tool.<|end|><|start|>assistant<|channel|>commentary
 *   to=functions.find_unpaired_order_exceptions <|constrain|>json<|message|>{"limit":25}
 *
 * Two consequences, and this module handles both:
 *
 *  1. **The call is invisible.** `grok-agent-loop` reads `message.tool_calls` /
 *     `delta.tool_calls`, so every turn came back as prose with
 *     `tools_used: 0`. `parseHarmonyToolCalls` extracts the calls.
 *  2. **The reasoning is visible.** The `analysis` channel is ordinary
 *     `delta.content`, so the operator's bubble streams the model's private
 *     deliberation ("…we don't have that tool listed… maybe we can use
 *     hybrid_entity_search?") verbatim. `createHarmonyTextFilter` suppresses
 *     every channel except `final`.
 *
 * Nothing here is model-specific beyond the grammar: a stream with no Harmony
 * marker passes through byte-identical, so Grok / Qwen / Ollama are untouched.
 *
 * This grammar is shared with the Mac-side eval harness
 * (`~/CycleForgeAI/scripts/eval_server.py`, which concatenates
 * `to=functions.<name>` itself) and with the Promptfoo `harmony-to-openai.js`
 * extractor. One grammar, three call sites — if it drifts, the goldens and the
 * dock disagree about what the model did.
 */

/** Any Harmony control token. Presence of one is what switches this on. */
const HARMONY_MARKER = /<\|(?:channel|message|start|end|constrain|return)\|>/;

/**
 * One tool intent: `to=functions.NAME` … `<|message|>{json}` up to the next
 * control token. The name charset is the OpenAI function-name charset.
 */
const HARMONY_CALL =
  /to=functions\.([A-Za-z0-9_-]{1,64})[^]*?<\|message\|>([^]*?)(?=<\|(?:end|start|channel|return)\|>|$)/g;

/** `<|channel|>NAME` — `analysis`, `commentary`, or `final`. */
const HARMONY_CHANNEL = /<\|channel\|>\s*([A-Za-z_]+)/;

export interface HarmonyToolCall {
  name: string;
  /** Raw JSON argument text, exactly as the model wrote it. */
  arguments: string;
}

/** Whether this text carries Harmony markup at all. Cheap; call it first. */
export function looksLikeHarmony(text: string): boolean {
  return HARMONY_MARKER.test(text) || text.includes('to=functions.');
}

/**
 * Every tool call in a Harmony message, in emission order.
 *
 * `allowed` is the advertised tool set. A name outside it is DROPPED, not
 * repaired: the registry is the authority on what exists, and a model that
 * asks for a tool nobody advertised is exactly the case that must not become a
 * dispatch. (The promoted adapter was trained against a 12-tool vocabulary of
 * which 9 do not exist in this app — measured — so this filter is load-bearing,
 * not defensive decoration.)
 */
export function parseHarmonyToolCalls(
  text: string,
  allowed: ReadonlySet<string>,
): HarmonyToolCall[] {
  if (!text.includes('to=functions.')) return [];
  const out: HarmonyToolCall[] = [];
  for (const match of text.matchAll(HARMONY_CALL)) {
    const name = match[1];
    if (!allowed.has(name)) continue;
    out.push({ name, arguments: wireSafeArguments(match[2] ?? '') });
  }
  return out;
}

/**
 * Arguments that are guaranteed to survive the round trip.
 *
 * The salvaged call is echoed back to the server inside
 * `assistant.tool_calls[].function.arguments`, and `mlx_lm.server` runs
 * `json.loads` on that string while rendering its chat template. A truncated
 * object — which is what a `max_tokens` cut produces — made the NEXT round fail
 * the whole turn: measured `404 {"error": "Expecting ',' delimiter: line 1
 * column 917"}` from the Mac, surfaced to the operator as a dead stream. An
 * unparseable object rides as `{}` and the registry's Zod parse asks the model
 * to try again, which is a repair round instead of a lost turn.
 */
function wireSafeArguments(raw: string): string {
  const text = raw.trim();
  if (!text.startsWith('{')) return '{}';
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    // A trailing narration tail is common: retry at the last closing brace.
    const close = text.lastIndexOf('}');
    if (close > 0) {
      try {
        return JSON.stringify(JSON.parse(text.slice(0, close + 1)));
      } catch {
        /* fall through */
      }
    }
    return '{}';
  }
}
/**
 * Strip Harmony markup from text meant for a human, keeping only the `final`
 * channel. A message that is pure `analysis` + `commentary` (i.e. a tool round)
 * yields the empty string, which is correct: the operator sees the phase line
 * and the artifact, never the deliberation.
 */
export function stripHarmony(text: string): string {
  if (!looksLikeHarmony(text)) return text;
  const segments = text.split(/<\|start\|>|<\|end\|>|<\|return\|>/);
  const kept: string[] = [];
  for (const segment of segments) {
    const channel = HARMONY_CHANNEL.exec(segment)?.[1];
    if (channel !== undefined && channel !== 'final') continue;
    const body = segment.includes('<|message|>')
      ? segment.slice(segment.indexOf('<|message|>') + '<|message|>'.length)
      : channel === undefined
        ? segment
        : '';
    const clean = body.replace(/<\|[a-z_]+\|>/g, '').trim();
    if (clean) kept.push(clean);
  }
  return kept.join('\n\n');
}

/** Every control token, plus the call opener — the strings a tail may become. */
const MARKERS = [
  '<|channel|>',
  '<|message|>',
  '<|constrain|>',
  '<|start|>',
  '<|end|>',
  '<|return|>',
  'to=functions.',
] as const;
const MAX_MARKER = Math.max(...MARKERS.map((m) => m.length));

export interface HarmonyTextFilter {
  /** Text from this chunk that may reach the operator (often ''). */
  push: (chunk: string) => string;
  /** Whatever was held back for a possible split marker. Call once, at end. */
  flush: () => string;
}

/**
 * Streaming counterpart of `stripHarmony`: one filter per round, fed the raw
 * `delta.content` chunks, returning only the text that may reach the operator.
 *
 * Until a Harmony marker is seen the filter is a pass-through, so a normal
 * OpenAI-wire model streams with no added latency beyond a held tail of at most
 * `MAX_MARKER` characters — released by `flush()` when the round ends. Once
 * markup appears it withholds everything outside the `final` channel, so a
 * marker split across two chunks can never be published as literal text.
 */
export function createHarmonyTextFilter(): HarmonyTextFilter {
  let harmony = false;
  let pending = '';
  let channel: string | null = null;
  let inMessage = false;
  /**
   * `<|channel|>` and its name can arrive in different chunks. Until the name
   * is provably complete (a non-letter follows it) the channel stays UNKNOWN,
   * which suppresses output — never the other way round.
   */
  let awaitingChannelName = false;

  /** Longest tail of `s` that is a PREFIX of some marker; that much is unsafe. */
  const heldSuffix = (s: string): number => {
    for (let n = Math.min(MAX_MARKER, s.length); n > 0; n -= 1) {
      const tail = s.slice(s.length - n);
      if (MARKERS.some((m) => m.startsWith(tail))) return n;
    }
    return 0;
  };

  const visible = (): boolean => channel === 'final' && inMessage && !awaitingChannelName;

  /** Consume the channel name once the buffer proves where it ends. */
  const resolveChannelName = (): void => {
    if (!awaitingChannelName) return;
    const name = /^\s*([A-Za-z_]+)(?=[^A-Za-z_])/.exec(pending);
    if (!name) return;
    channel = name[1];
    awaitingChannelName = false;
    pending = pending.slice(name[0].length);
  };

  const flushable = (all: boolean): string => {
    let emit = '';
    resolveChannelName();
    for (;;) {
      if (awaitingChannelName) break;
      const nextMarker = pending.indexOf('<|');
      if (nextMarker === -1) break;
      const close = pending.indexOf('|>', nextMarker);
      // An unterminated marker: keep it for the next chunk.
      if (close === -1) break;
      if (visible()) emit += pending.slice(0, nextMarker);
      const token = pending.slice(nextMarker + 2, close);
      pending = pending.slice(close + 2);
      if (token === 'channel') {
        // The channel NAME follows the token, before `<|message|>`.
        channel = null;
        inMessage = false;
        awaitingChannelName = true;
        resolveChannelName();
      } else if (token === 'message') {
        inMessage = true;
      } else if (token === 'end' || token === 'start' || token === 'return') {
        channel = null;
        inMessage = false;
      }
    }
    // While the channel name is still arriving, the buffer IS that name: hold
    // all of it, or it would be consumed as suppressed body text.
    if (awaitingChannelName && !all) return emit;
    const hold = all ? 0 : heldSuffix(pending);
    const settled = pending.slice(0, pending.length - hold);
    if (settled) {
      if (visible()) emit += settled;
      pending = pending.slice(settled.length);
    }
    return emit;
  };

  const passThrough = (all: boolean): string => {
    const hold = all ? 0 : heldSuffix(pending);
    const out = pending.slice(0, pending.length - hold);
    pending = pending.slice(pending.length - hold);
    return out;
  };

  return {
    push(chunk: string): string {
      pending += chunk;
      if (!harmony) {
        if (!looksLikeHarmony(pending)) return passThrough(false);
        harmony = true;
        // Anything before the first marker was ordinary prose; keep it.
        const first = pending.search(/<\||to=functions\./);
        const prose = first > 0 ? pending.slice(0, first) : '';
        pending = first > 0 ? pending.slice(first) : pending;
        return prose + flushable(false);
      }
      return flushable(false);
    },
    flush(): string {
      if (!harmony) return passThrough(true);
      // A trailing partial marker is markup, not text: drop it.
      const out = flushable(true);
      pending = '';
      return out;
    },
  };
}
