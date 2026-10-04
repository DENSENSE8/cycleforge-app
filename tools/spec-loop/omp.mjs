/**
 * Headless omp — the only harness the spec loop uses (operator ruling 2026-10-03: no Hermes).
 *
 * One call = one fresh session (`--mode json`), written to `outFile` as JSONL. Returns the
 * final assistant text, the summed cost and the wall time, read from the `agent_end` /
 * `message_end` events — never from what the model claims about itself.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

/**
 * @param {{ cwd: string, model: string, thinking?: string, tools: string, promptFile: string,
 *           outFile: string, maxTime?: string, sessionDir?: string }} o
 * @returns {Promise<{ code: number | null, seconds: number, cost: number, text: string }>}
 */
export function runOmp(o) {
  const args = [
    '-p', '--mode', 'json', '--model', o.model, '--thinking', o.thinking ?? 'medium',
    '--tools', o.tools, '--no-lsp', '--no-title', '--auto-approve', '--max-time', o.maxTime ?? '15m',
    ...(o.sessionDir ? ['--session-dir', o.sessionDir] : ['--no-session']),
    `@${o.promptFile}`,
  ];
  const started = Date.now();
  return new Promise((resolve) => {
    const fd = fs.openSync(o.outFile, 'w');
    const child = spawn('omp', args, { cwd: o.cwd, stdio: ['ignore', fd, fd] });
    child.on('close', (code) => {
      fs.closeSync(fd);
      resolve({ code, seconds: Math.round((Date.now() - started) / 1000), ...readOmpOutput(o.outFile) });
    });
  });
}

/** @returns {{ cost: number, text: string }} */
export function readOmpOutput(file) {
  let cost = 0;
  let text = '';
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.startsWith('{')) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'message_end') cost += Number(event.message?.usage?.cost?.total ?? 0);
    if (event.type === 'agent_end') {
      const last = [...(event.messages ?? [])].reverse().find((m) => m.role === 'assistant');
      text = (last?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
    }
  }
  return { cost, text };
}
