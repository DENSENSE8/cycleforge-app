/** execute_build_sandbox — syntax/type validation of generated tool code, in a throwaway VM. */

import type { OrgId } from '@/lib/tenancy/constants';

/** Where payload files land inside the VM. Nothing may escape it. */
const WORKDIR = '/tmp/forge';

/** Hard caps — a payload that exceeds them is refused without booting a VM. */
export const MAX_PAYLOAD_FILES = 25;
export const MAX_PAYLOAD_BYTES = 512 * 1024;
const SANDBOX_TIMEOUT_MS = 180_000;

/**
 * The complete, frozen set of things that may run. Adding a step is a code
 * change reviewed by a human, which is the entire point.
 */
export const VALIDATION_STEPS: ReadonlyArray<{ label: string; cmd: string; args: readonly string[] }> = [
  {
    label: 'typecheck',
    cmd: 'npx',
    args: ['--yes', 'typescript@5', 'tsc', '--noEmit', '--skipLibCheck', '--target', 'es2022',
           '--module', 'esnext', '--moduleResolution', 'bundler', '--strict'],
  },
] as const;

interface CodePayloadFile {
  path: string;
  contents: string;
}

interface SandboxValidationResult {
  ok: boolean;
  /** Per-step outcome, in order. Empty when the payload was refused up front. */
  steps: Array<{ label: string; exitCode: number; stdout: string; stderr: string }>;
  /** Set when the payload never reached a VM. */
  rejected?: string;
}

/** Injected so the unit tests never boot a VM or need a Vercel token. */
export interface SandboxRunner {
  run: (
    files: ReadonlyArray<{ path: string; content: Uint8Array }>,
    steps: typeof VALIDATION_STEPS,
  ) => Promise<Array<{ label: string; exitCode: number; stdout: string; stderr: string }>>;
}

/**
 * Validate a payload. Returns a RESULT, never throws for a failing build — a
 * failed typecheck is an outcome the caller records, not an exception.
 */
export async function validateCodePayload(
  _orgId: OrgId,
  files: ReadonlyArray<CodePayloadFile>,
  runner: SandboxRunner = defaultRunner,
): Promise<SandboxValidationResult> {
  const rejection = screenPayload(files);
  if (rejection) return { ok: false, steps: [], rejected: rejection };

  const encoded = files.map((f) => ({
    path: `${WORKDIR}/${normalizeRelative(f.path)}`,
    content: new TextEncoder().encode(f.contents),
  }));

  const steps = await runner.run(encoded, VALIDATION_STEPS);
  return { ok: steps.every((s) => s.exitCode === 0), steps };
}

/**
 * Static screen, run before any VM exists. Every rejection here is a payload
 * that could not have been produced by an honest generator.
 */
export function screenPayload(files: ReadonlyArray<CodePayloadFile>): string | null {
  if (files.length === 0) return 'payload contained no files';
  if (files.length > MAX_PAYLOAD_FILES) {
    return `payload has ${files.length} files, over the ${MAX_PAYLOAD_FILES}-file cap`;
  }

  let total = 0;
  const seen = new Set<string>();
  for (const f of files) {
    total += f.contents.length;
    if (total > MAX_PAYLOAD_BYTES) {
      return `payload exceeds the ${MAX_PAYLOAD_BYTES}-byte cap`;
    }
    const raw = String(f.path ?? '');
    if (!raw) return 'payload contained a file with no path';
    if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) {
      return `absolute path not allowed: ${raw}`;
    }
    if (raw.includes('\0')) return `path contains a null byte: ${raw}`;
    const rel = normalizeRelative(raw);
    if (rel === null) return `path escapes the sandbox workdir: ${raw}`;
    if (seen.has(rel)) return `duplicate path in payload: ${rel}`;
    seen.add(rel);
  }
  return null;
}

/**
 * Resolve a payload path against the workdir root WITHOUT touching the real
 * filesystem. Returns null if it would escape. Done by hand rather than with
 * node:path so the rule is the same on every platform and reads plainly.
 */
function normalizeRelative(input: string): string {
  const out: string[] = [];
  for (const seg of input.split(/[\\/]+/)) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length === 0) return null as unknown as string;
      out.pop();
      continue;
    }
    out.push(seg);
  }
  return out.length === 0 ? (null as unknown as string) : out.join('/');
}

/**
 * The real runner: a @vercel/sandbox VM, stopped in a finally so a thrown step
 * cannot leak a machine. Imported lazily so unit tests that inject a fake
 * runner never pull the SDK (or its OIDC/token requirement) into the process.
 */
const defaultRunner: SandboxRunner = {
  async run(files, steps) {
    const { Sandbox } = await import('@vercel/sandbox');
    const sandbox = await Sandbox.create({ runtime: 'node24', timeout: SANDBOX_TIMEOUT_MS });
    try {
      await sandbox.writeFiles(files as Array<{ path: string; content: Uint8Array }>);
      const out: Array<{ label: string; exitCode: number; stdout: string; stderr: string }> = [];
      for (const step of steps) {
        // Paths are appended by US from the screened file list — never spliced
        // in from the payload's own text.
        const paths = files.map((f) => f.path);
        const res = await sandbox.runCommand(step.cmd, [...step.args, ...paths]);
        out.push({
          label: step.label,
          exitCode: res.exitCode ?? 1,
          stdout: truncate(await readStream(res.stdout)),
          stderr: truncate(await readStream(res.stderr)),
        });
        if (res.exitCode !== 0) break; // no point running later steps
      }
      return out;
    } finally {
      await sandbox.stop().catch(() => { /* the VM is disposable; a failed stop must not mask the result */ });
    }
  },
};

async function readStream(v: unknown): Promise<string> {
  if (typeof v === 'string') return v;
  if (v && typeof (v as { text?: () => Promise<string> }).text === 'function') {
    return (v as { text: () => Promise<string> }).text();
  }
  return '';
}

function truncate(s: string): string {
  return s.length > 4000 ? `${s.slice(0, 4000)}\n…(truncated)` : s;
}
