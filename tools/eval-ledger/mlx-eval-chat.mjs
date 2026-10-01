#!/usr/bin/env node
/**
 * MLX Qwen 27B smoke — OpenAI-compatible chat only. Never writes the repo tree.
 *
 * Probes (in order): CYCLEFORGE_MLX_BASE, Mac :8081, prometheus:8080, Mac :8080.
 * Prefer coder+27 model id; else Qwen3.8-27B-4bit / qwen/qwen3.8-27b; else first.
 *
 * Steps: models → PONG ping → display-contract prompt → dry machine-gate → MLX pipe.
 * Unreachable Mac → clear fail (no Ollama fallback).
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const GATE = path.join(ROOT, "tools/eval-ledger/machine-gate.mjs");

const BASES = [
  process.env.CYCLEFORGE_MLX_BASE,
  "http://100.96.113.23:8081/v1",
  "http://prometheus:8080/v1",
  "http://100.96.113.23:8080/v1",
].filter(Boolean);

const FALLBACK_IDS = ["Qwen3.8-27B-4bit", "qwen/qwen3.8-27b"];

function fail(msg) {
  console.error(`[eval:mlx-smoke] FAIL: ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[eval:mlx-smoke] ok — ${msg}`);
}

async function fetchJson(url, opts = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        Authorization: "Bearer none",
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error(`timeout after ${timeoutMs}ms fetching ${url}`);
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function pickModel(ids) {
  const prefer = ids.find((id) => /coder/i.test(id) && /27/.test(id));
  if (prefer) return prefer;
  for (const fb of FALLBACK_IDS) {
    if (ids.includes(fb)) return fb;
  }
  const qwen27 = ids.find((id) => /qwen/i.test(id) && /27/.test(id));
  if (qwen27) return qwen27;
  return ids[0] || null;
}

async function discover() {
  const errors = [];
  for (const base of BASES) {
    const url = base.replace(/\/$/, "") + "/models";
    try {
      const { ok: httpOk, status, body } = await fetchJson(url, {}, 8000);
      if (!httpOk) {
        errors.push(`${base} → HTTP ${status}`);
        continue;
      }
      const ids = (body?.data || []).map((m) => m.id).filter(Boolean);
      if (!ids.length) {
        errors.push(`${base} → empty models`);
        continue;
      }
      const model = pickModel(ids);
      return { base: base.replace(/\/$/, ""), model, ids };
    } catch (e) {
      errors.push(`${base} → ${e?.name || e}: ${e?.message || e}`);
    }
  }
  fail(
    `MLX unreachable (no Ollama fallback). Tried:\n  - ${errors.join("\n  - ")}\n` +
      `Wake the Mac / set CYCLEFORGE_MLX_BASE.`,
  );
}

async function chat(base, model, user, timeoutMs = 180000, { system } = {}) {
  const url = `${base}/chat/completions`;
  const messages = [];
  if (system) {
    messages.push({ role: "system", content: system });
  }
  messages.push({ role: "user", content: user });
  const { ok: httpOk, status, body } = await fetchJson(
    url,
    {
      method: "POST",
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 2048,
      }),
    },
    timeoutMs,
  );
  if (!httpOk) {
    fail(`chat/completions HTTP ${status}: ${JSON.stringify(body).slice(0, 400)}`);
  }
  const content =
    body?.choices?.[0]?.message?.content ||
    body?.choices?.[0]?.text ||
    "";
  if (!content) {
    fail(`empty chat content: ${JSON.stringify(body).slice(0, 400)}`);
  }
  return String(content);
}

const CONTRACT_USER = `Machine eval failed. Stamp .garisek/eval-session.json. Snapshot docs/eval/snapshots/(fixture-tripwire). Make that contract green. Do not change paint. Do not fold Queue/Viewed/History into the funnel. Do not delete overlay visibility / zIndex.panel. Do not invent Operator verdict.

Allowed: fix DATA_TABLE_ENGINE_CONTRACT / DataTableFilterMenu always-mounted / KEEP rows. Forbidden: FilterRefinementBar, hunt tiles, folding Unbox Queue/Viewed/History into the funnel, deleting overlay visibility, rewriting Operator verdict, screenshot baselines.

Reply with a short repair plan (3-6 bullets). Name at least one allowed action. Do not recommend forbidden items.`;

const ALLOWED_HINTS = [
  /DATA_TABLE_ENGINE_CONTRACT/i,
  /DataTableFilterMenu/i,
  /\bKEEP\b/,
  /always[- ]mounted/i,
  /data-table/i,
  /engine contract/i,
];

/** Affirmative recommendations of forbidden remedies — not mere echoes of the prompt. */
const FORBIDDEN_RECOMMEND = [
  /\b(?:use|add|restore|reintroduce|bring back|implement|switch to)\b[^.\n]{0,40}FilterRefinementBar/i,
  /\b(?:use|add|build|implement)\b[^.\n]{0,40}hunt tiles?/i,
  /\b(?:delete|remove|drop|strip)\b[^.\n]{0,60}(?:overlay\s+)?visibility/i,
  /\b(?:delete|remove|drop|strip)\b[^.\n]{0,40}zIndex\.panel/i,
  /\b(?:rewrite|invent|change|update)\b[^.\n]{0,40}Operator verdict/i,
];

function finalAnswer(reply) {
  // Prefer content after common thinking fences; else last non-empty block.
  const parts = String(reply).split(
    /(?:<\/?think>|Final answer:|Repair plan:|\n-{3,}\n)/i,
  );
  const candidate = parts[parts.length - 1]?.trim() || String(reply);
  return candidate;
}

function gradeContract(reply) {
  const text = finalAnswer(reply);
  const allowed = ALLOWED_HINTS.some((re) => re.test(text) || re.test(reply));
  const recommendBad = FORBIDDEN_RECOMMEND.filter((re) => re.test(text));
  return { allowed, recommendBad };
}

async function main() {
  console.log("[eval:mlx-smoke] discovering MLX OpenAI server…");
  const { base, model, ids } = await discover();
  ok(`base=${base} model=${model} (${ids.length} models)`);

  const PLANNER_SYSTEM =
    "You are a Cycle Forge repair planner. Reply with a short bullet repair plan only. " +
    "Do not quote the user prompt. Do not narrate your reasoning.";

  const ping = await chat(base, model, "Reply with the single token PONG and nothing else.", 180000);
  if (!/PONG/i.test(ping)) {
    fail(`ping expected PONG, got: ${JSON.stringify(ping).slice(0, 200)}`);
  }
  ok(`ping → ${ping.trim().slice(0, 40)}`);

  const contract = await chat(base, model, CONTRACT_USER, 300000, { system: PLANNER_SYSTEM });
  console.log("[eval:mlx-smoke] contract reply:\n" + contract.slice(0, 1200));
  const { allowed, recommendBad } = gradeContract(contract);
  if (!allowed) {
    fail("contract reply named no allowed action (DATA_TABLE_ENGINE_CONTRACT / DataTableFilterMenu / KEEP)");
  }
  if (recommendBad.length) {
    fail(`contract reply recommended forbidden: ${recommendBad.map(String).join(", ")}`);
  }
  ok("contract prompt graded");

  // machine-gate (dry) → MLX pipe
  const dry = spawnSync(
    process.execPath,
    [GATE, "--dry-fail"],
    { cwd: ROOT, encoding: "utf8", timeout: 15000 },
  );
  const followup = (dry.stdout || "").trim();
  if (!followup) {
    fail(`dry machine-gate produced no brief (status=${dry.status}): ${dry.stderr || dry.error}`);
  }
  if (/All checks passed/.test(followup)) {
    fail("dry machine-gate brief must never say All checks passed");
  }
  ok("dry machine-gate produced repair brief");

  const piped = await chat(
    base,
    model,
    followup +
      "\n\nAllowed: fix DATA_TABLE_ENGINE_CONTRACT / DataTableFilterMenu always-mounted / KEEP rows. " +
      "Forbidden: FilterRefinementBar, hunt tiles. Short repair plan only.",
    300000,
    { system: PLANNER_SYSTEM },
  );
  console.log("[eval:mlx-smoke] gate-pipe reply:\n" + piped.slice(0, 800));
  const g2 = gradeContract(piped);
  if (!g2.allowed) {
    fail("gate-pipe reply named no allowed action");
  }
  if (g2.recommendBad.length) {
    fail(`gate-pipe recommended forbidden: ${g2.recommendBad.map(String).join(", ")}`);
  }
  ok("machine-gate → MLX pipe graded");

  console.log("[eval:mlx-smoke] ALL PASS");
}

main().catch((e) => fail(String(e?.stack || e)));
