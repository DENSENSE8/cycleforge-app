/**
 * Self-hosted CI — the pure half.
 *
 * Plan: `docs/todo/self-hosted-ci-and-fork-teardown-PLAN.md` §3 + §4.1.
 *
 * Everything here is a function of its arguments: no git, no filesystem, no
 * clock. `scripts/ci-runner.mjs` and `scripts/ci-status.mjs` do the I/O and
 * call in; `src/lib/ci/ci-core.test.ts` is the tripwire that proves the
 * receipt contract, the cache key and the profile rule — a law with no check
 * is a comment.
 *
 * ## The contract in one paragraph
 *
 * A COMMIT gets a RECEIPT (`.ci/receipts/<sha>.json`). A receipt is a list of
 * GATES, each keyed by an INPUT HASH — `sha256` over the blob ids of the paths
 * the gate declares plus the toolchain — and each either `hit` (served from
 * `.ci/cache/<gate>/<hash>.json`, nothing ran) or `ran`. A gate that declares
 * no inputs is never cached. Only PASSES are cached: a failure re-runs on the
 * next commit with the same inputs, which is exactly the observation the flake
 * quarantine (§4.3) is built on.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';

export const RECEIPT_VERSION = 1;

/** Box-local state — gitignored, written only by the runner. */
export const CI_PATHS = Object.freeze({
  root: '.ci',
  queue: '.ci/queue',
  receipts: '.ci/receipts',
  cache: '.ci/cache',
  logs: '.ci/logs',
  history: '.ci/history',
  lock: '.ci/lock',
  flaky: '.ci/flaky.json',
});

/**
 * @typedef {'fast' | 'full'} CiProfile
 * @typedef {'pass' | 'fail' | 'advisory-fail'} GateStatus
 *
 * @typedef {{
 *   name: string,
 *   cmd: string,
 *   args: string[],
 *   keyArgs?: string[],
 *   env?: Record<string, string>,
 *   inputs?: readonly string[],
 *   advisory?: boolean,
 * }} CiGate
 *
 * @typedef {{
 *   node: string,
 *   pnpm: string | null,
 *   platform: string,
 *   arch: string,
 *   nodeModules: string,
 * }} Toolchain
 *
 * @typedef {{
 *   gate: string,
 *   slug: string,
 *   inputHash: string | null,
 *   cached: 'hit' | 'ran',
 *   status: GateStatus,
 *   durationMs: number,
 *   logPath: string,
 *   from?: string,
 *   command: string,
 * }} GateReceipt
 *
 * @typedef {{
 *   version: number,
 *   sha: string,
 *   branch: string | null,
 *   profile: CiProfile,
 *   startedAt: string,
 *   finishedAt: string,
 *   durationMs: number,
 *   worktree: string,
 *   toolchain: Toolchain,
 *   untracked: string[],
 *   warnings: string[],
 *   gates: GateReceipt[],
 *   ok: boolean,
 * }} Receipt
 */

/**
 * Which profile a commit earns. `main` is the landing branch, so it pays for
 * the full tier (unit tests + cohorts); everything else gets lint + typecheck.
 * @param {string | null | undefined} branch
 * @returns {CiProfile}
 */
export function profileForBranch(branch) {
  return branch === 'main' ? 'full' : 'fast';
}

/** `Unit tests` → `unit-tests`: the cache / log directory name. */
export function gateSlug(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The bytes that become a gate's input hash.
 *
 * `lsFiles` is the raw output of `git ls-files -s -- <inputs>` in the
 * worktree: one `<mode> <blob> <stage>\t<path>` line per tracked file. Blob ids
 * ARE the content hash, so this costs one git call and reads no files.
 *
 * Folded in beside it: the gate's identity (name, command basename, the args
 * that carry meaning — `keyArgs` when the runner varies an arg that does not,
 * such as a cache directory — and env), the declared input list, and the
 * toolchain. The command is keyed by BASENAME on purpose: the absolute
 * `node_modules/.bin` path differs per worktree and would make every run a miss.
 *
 * Undeclared inputs return `null`: an undeclared gate runs every time, never
 * hits, never writes the cache.
 *
 * @param {{ gate: CiGate, toolchain: Toolchain, lsFiles: string }} arg
 * @returns {string | null}
 */
export function gateInputHash({ gate, toolchain, lsFiles }) {
  if (!gate.inputs || gate.inputs.length === 0) return null;
  const material = [
    `v${RECEIPT_VERSION}`,
    `gate=${gate.name}`,
    `cmd=${path.basename(gate.cmd)}`,
    `args=${JSON.stringify(gate.keyArgs ?? gate.args)}`,
    `env=${JSON.stringify(gate.env ?? {})}`,
    `toolchain=${JSON.stringify(toolchain)}`,
    `inputs=${JSON.stringify(gate.inputs)}`,
    lsFiles.trim(),
  ].join('\n');
  return createHash('sha256').update(material).digest('hex');
}

/**
 * Parse `.ci/queue` (`<sha> <branch> <epoch>` per line, appended by the
 * post-commit hook). Duplicate shas collapse onto the LAST line (its branch
 * wins). `main` drains first — it is the landing branch and its receipt is
 * the one every other step waits on — then FIFO.
 *
 * @param {string} text
 * @returns {{ sha: string, branch: string | null, at: number }[]}
 */
export function parseQueue(text) {
  /** @type {Map<string, { sha: string, branch: string | null, at: number, order: number }>} */
  const bySha = new Map();
  let order = 0;
  for (const raw of String(text ?? '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const [sha, branch, epoch] = line.split(/\s+/);
    if (!/^[0-9a-f]{7,40}$/i.test(sha ?? '')) continue;
    const prev = bySha.get(sha);
    bySha.set(sha, {
      sha,
      branch: branch && branch !== 'detached' ? branch : null,
      at: Number(epoch) || 0,
      order: prev?.order ?? order++,
    });
  }
  return [...bySha.values()]
    .sort((a, b) => {
      const am = a.branch === 'main' ? 0 : 1;
      const bm = b.branch === 'main' ? 0 : 1;
      return am - bm || a.order - b.order;
    })
    .map(({ sha, branch, at }) => ({ sha, branch, at }));
}

/**
 * The queue text with the processed shas removed — re-read the file before
 * calling so lines appended DURING the run survive.
 * @param {string} text
 * @param {Iterable<string>} shas
 */
export function queueWithout(text, shas) {
  const drop = new Set([...shas].map((s) => s.toLowerCase()));
  const kept = String(text ?? '')
    .split('\n')
    .filter((line) => {
      const sha = line.trim().split(/\s+/)[0]?.toLowerCase();
      return line.trim() !== '' && !drop.has(sha);
    });
  return kept.length ? `${kept.join('\n')}\n` : '';
}

/** A receipt is green when every hard gate passed; advisory failures do not block. */
export function receiptOk(gates) {
  return gates.every((g) => g.status === 'pass' || g.status === 'advisory-fail');
}

/**
 * @param {Omit<Receipt, 'version' | 'ok' | 'durationMs'>} fields
 * @returns {Receipt}
 */
export function buildReceipt(fields) {
  return {
    version: RECEIPT_VERSION,
    ...fields,
    durationMs: Math.max(0, Date.parse(fields.finishedAt) - Date.parse(fields.startedAt)),
    ok: receiptOk(fields.gates),
  };
}

/**
 * Cache hit ratio over a set of receipts. Gates with no input hash are
 * excluded from the denominator — an undeclared gate can never hit, so counting
 * it would report a ratio the cache had no say in.
 * @param {Receipt[]} receipts
 */
export function hitRatio(receipts) {
  let hits = 0;
  let ran = 0;
  for (const r of receipts) {
    for (const g of r.gates ?? []) {
      if (g.inputHash == null) continue;
      if (g.cached === 'hit') hits += 1;
      else ran += 1;
    }
  }
  const total = hits + ran;
  return { hits, ran, ratio: total === 0 ? 0 : hits / total };
}

/**
 * "First red" — notify only when this receipt is red and the previous one on
 * the same branch was green (or absent), so a broken branch does not ping on
 * every follow-up commit.
 * @param {Receipt} receipt
 * @param {Receipt | null | undefined} previousOnBranch
 */
export function isFirstRed(receipt, previousOnBranch) {
  if (receipt.ok) return false;
  return !previousOnBranch || previousOnBranch.ok;
}

/** `Lint=hit ✓ · Typecheck=ran ✗` */
export function summarizeGates(gates) {
  return gates
    .map((g) => {
      const mark = g.status === 'pass' ? '✓' : g.status === 'advisory-fail' ? '!' : '✗';
      return `${g.gate}=${g.cached === 'hit' ? 'hit' : 'ran'} ${mark}`;
    })
    .join(' · ');
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${String(s % 60).padStart(2, '0')}s`;
}
