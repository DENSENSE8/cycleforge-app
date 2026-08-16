/**
 * PM2 Ecosystem Config — Self-Improving Pipeline (host-portable)
 *
 * Manages the local processes for the autonomous code pipeline:
 *   - Redis:       Job queue backend
 *   - Inference:   Local LLM inference — MLX (Apple Silicon) OR Ollama (NVIDIA/CUDA)
 *   - Hermes:      Agent gateway (OpenAI-compat on :8642) the app proxies to
 *   - Pipeline:    The orchestrator loop (discover → implement → validate → collect)
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 logs pipeline          # watch the orchestrator
 *   pm2 stop all               # stop everything
 *   pm2 save && pm2 startup    # persist across reboots
 *
 * ── Inference backend ───────────────────────────────────────────────
 * The inference layer is selected by FORGE_INFERENCE_BACKEND:
 *   - 'mlx'  (default) — Apple Silicon Macs. Serves mlx_lm on :8085/:8086.
 *   - 'cuda' | 'ollama' — NVIDIA hosts (e.g. RTX 5070 Ti under WSL2). MLX is
 *     Metal-only and CANNOT run here; inference is served by Ollama on :11434.
 *
 * On a CUDA host, install Ollama in the same environment (WSL2) and either let
 * this config run `ollama serve`, or manage it externally and set
 * FORGE_OLLAMA_MANAGED=external to skip the pm2-managed server.
 *
 * Paths below default to the Mac layout and are overridable by env so a Linux/
 * WSL layout (e.g. a different venv or Hermes home) needs no edit to this file:
 *   LOCALAI_PYTHON, HERMES_PYTHON, HERMES_HOME, MLX_BASE_URL, MLX_MODEL, OLLAMA_HOST
 *
 * The USAV web app continues to run on Vercel.
 * The Jetson trainer runs as a systemd service (see scripts/jetson/).
 */

const path = require('path');

// Load .env for DATABASE_URL and other vars
require('dotenv').config({ path: path.join(__dirname, '.env') });

const HOME = process.env.HOME || process.env.USERPROFILE || '';

// Inference backend selection (see header).
const BACKEND = (process.env.FORGE_INFERENCE_BACKEND || 'mlx').toLowerCase();
const isCuda = BACKEND === 'cuda' || BACKEND === 'ollama';

// OpenAI-compatible base URL the pipeline (and Hermes) call for inference.
// MLX serves on :8085; Ollama on :11434. Explicit MLX_BASE_URL always wins.
const OLLAMA_HOST = process.env.OLLAMA_HOST || '127.0.0.1:11434';
const INFERENCE_BASE_URL =
  process.env.MLX_BASE_URL ||
  (isCuda ? `http://${OLLAMA_HOST}/v1` : 'http://127.0.0.1:8085/v1');

// Interpreter / home paths — Mac defaults, overridable for Linux/WSL.
const LOCALAI_PYTHON =
  process.env.LOCALAI_PYTHON || path.join(HOME, '.venvs/localai/bin/python');
const HERMES_PYTHON =
  process.env.HERMES_PYTHON || path.join(HOME, '.hermes/hermes-agent/venv/bin/python');
const HERMES_HOME = process.env.HERMES_HOME || path.join(HOME, '.hermes-usav');

const apps = [];

// ─── Redis ─────────────────────────────────────────────
apps.push({
  name: 'redis',
  script: 'redis-server',
  args: '--port 6379 --maxmemory 256mb --maxmemory-policy allkeys-lru',
  autorestart: true,
  max_restarts: 10,
});

if (!isCuda) {
  // ─── MLX LM Server (Apple Silicon) ────────────────────
  // Serves the local model (base or fine-tuned) on port 8085.
  // Change --model path after Jetson produces a new adapter.
  apps.push({
    name: 'mlx-server',
    script: LOCALAI_PYTHON,
    args: '-m mlx_lm.server --port 8085',
    autorestart: true,
    max_restarts: 5,
    restart_delay: 5000,
    env: {
      // Default: use base model. After fine-tuning, update to adapter path:
      // MLX_MODEL_PATH: '~/models/usav-coder-v1'
    },
  });

  // ─── MLX LM Server — Llama 3.2 3B (Hermes local chat agent) ───
  // Serves Llama 3.2 3B Instruct 4bit on port 8086 for Hermes.
  apps.push({
    name: 'mlx-server-llama',
    script: LOCALAI_PYTHON,
    args: '-m mlx_lm.server --port 8086 --model mlx-community/Llama-3.2-3B-Instruct-4bit',
    autorestart: true,
    max_restarts: 5,
    restart_delay: 5000,
  });
} else if (process.env.FORGE_OLLAMA_MANAGED !== 'external') {
  // ─── Ollama server (NVIDIA/CUDA — e.g. RTX 5070 Ti under WSL2) ───
  // OpenAI-compatible endpoint on :11434. Requires Ollama installed with GPU
  // support (NVIDIA driver + CUDA visible in this environment). Pull the models
  // the pipeline/Hermes expect first, e.g.:
  //   ollama pull qwen2.5-coder:7b
  //   ollama pull llama3.2:3b
  //   ollama pull nomic-embed-text
  // Set FORGE_OLLAMA_MANAGED=external to let a systemd/service-managed Ollama own the port.
  apps.push({
    name: 'ollama',
    script: 'ollama',
    args: 'serve',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    env: {
      OLLAMA_HOST,
    },
  });
}

// ─── Hermes Gateway (local agent runtime + OpenAI-compat API on :8642) ─
// Hosts the api_server platform adapter bound to 127.0.0.1:8642 — that is what
// /api/ai/openclaw-chat (and the chat-health probe) proxies to.
apps.push({
  name: 'hermes-gateway',
  // Invoke the hermes venv python directly. PM2 treats bare shell scripts as
  // Node otherwise and chokes on the Python shebang.
  script: HERMES_PYTHON,
  args: '-m hermes_cli.main gateway run',
  autorestart: true,
  max_restarts: 5,
  restart_delay: 5000,
  env: {
    HERMES_HOME,
    PATH: `${path.join(HOME, '.local/bin')}:${process.env.PATH || ''}`,
  },
});

// ─── Pipeline Orchestrator ─────────────────────────────
// The main autonomous loop. Discovers tasks, implements via LLM, validates with
// tests/lint/typecheck, and collects training data.
apps.push({
  name: 'pipeline',
  script: 'npx',
  args: 'tsx src/lib/pipeline/orchestrator.ts',
  cwd: __dirname,
  autorestart: true,
  max_restarts: 10,
  restart_delay: 10000,
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    // Points at MLX (:8085) or Ollama (:11434) depending on backend.
    MLX_BASE_URL: INFERENCE_BASE_URL,
    MLX_MODEL: process.env.MLX_MODEL || 'default',
    PIPELINE_REPO_PATH: __dirname,
    PIPELINE_CYCLE_SEC: '600',
    PIPELINE_MAX_TASKS: '8',
    PIPELINE_MAX_IMPL: '5',
    PIPELINE_RUN_BUILD: 'false',
    NODE_OPTIONS: '--max-old-space-size=4096',
  },
});

// ─── Master-plan sync daemon (agentic loop) ────────────
// Bridges ./master-plan.mdx ↔ Yjs ↔ Ably (org:{uuid}:forge:master-plan).
// Start: pm2 start ecosystem.config.cjs --only master-plan-sync
apps.push({
  name: 'master-plan-sync',
  script: 'npx',
  args: 'tsx .cycle_forge_ops/scripts/master-plan-sync-daemon.mjs',
  cwd: __dirname,
  autorestart: true,
  max_restarts: 10,
  restart_delay: 5000,
  env: {
    ABLY_API_KEY: process.env.ABLY_API_KEY,
    MASTER_PLAN_PATH: process.env.MASTER_PLAN_PATH || '',
    MASTER_PLAN_ORG_ID: process.env.MASTER_PLAN_ORG_ID || process.env.FORGE_ORG_ID || '',
  },
});

module.exports = { apps };
