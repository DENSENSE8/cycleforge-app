#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.CYCLEFORGE_INFERENCE_SSH || 'gex45';
const expectedModel = process.env.CYCLEFORGE_INFERENCE_MODEL || 'cf-v2-base';

function ssh(args, options = {}) {
  const result = spawnSync(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=12', host, ...args],
    {
      cwd: root,
      encoding: 'utf8',
      ...options,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `ssh exited ${result.status}`).trim());
  }
  return result.stdout.trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  process.stdout.write(`[cycleforge-inference] host=${host} model=${expectedModel}\n`);

  const localEnvHash = createHash('sha256').update(readFileSync(path.join(root, '.env'))).digest('hex');
  const remoteEvidence = ssh([
    "mode=$(stat -c %a /opt/cycleforge-loop/secrets/cycleforge-inference.env); hash=$(sed -n 's/^CYCLEFORGE_ENV_SOURCE_SHA256=//p' /opt/cycleforge-loop/secrets/cycleforge-inference.env); printf '%s %s' \"$mode\" \"$hash\"",
  ]).split(/\s+/);
  assert(remoteEvidence[0] === '600', 'remote inference env must have mode 0600');
  assert(remoteEvidence[1] === localEnvHash, 'remote inference env provenance hash does not match local .env');

  assert(ssh(['systemctl is-active vllm']) === 'active', 'vllm.service is not active');
  assert(ssh(['systemctl is-enabled vllm']) === 'enabled', 'vllm.service is not enabled at boot');
  ssh(['curl -fsS --max-time 5 http://127.0.0.1:8000/health >/dev/null']);

  const models = JSON.parse(ssh(['curl -fsS --max-time 10 http://127.0.0.1:8000/v1/models']));
  assert(models.data?.some((model) => model.id === expectedModel), `model ${expectedModel} is not served`);

  const fixture = {
    model: expectedModel,
    temperature: 0,
    max_tokens: 128,
    messages: [
      { role: 'system', content: 'Return only JSON matching the schema. You route warehouse exceptions.' },
      { role: 'user', content: 'Slot A01 is full. Candidate B02 has capacity. Return the reroute decision for order 42.' },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'reroute',
        schema: {
          type: 'object',
          properties: {
            orderId: { type: 'integer' },
            fromSlot: { type: 'string' },
            toSlot: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['orderId', 'fromSlot', 'toSlot', 'reason'],
          additionalProperties: false,
        },
      },
    },
  };

  const startedAt = performance.now();
  const completion = JSON.parse(
    ssh(
      [
        'curl -fsS --max-time 30 http://127.0.0.1:8000/v1/chat/completions',
        '-HContent-Type:application/json',
        '--data-binary',
        '@-',
      ],
      { input: JSON.stringify(fixture) },
    ),
  );
  const latencyMs = Math.round(performance.now() - startedAt);
  const decision = JSON.parse(completion.choices?.[0]?.message?.content ?? 'null');
  assert(decision?.orderId === 42, 'reroute fixture returned the wrong order');
  assert(decision?.fromSlot === 'A01', 'reroute fixture returned the wrong source slot');
  assert(decision?.toSlot === 'B02', 'reroute fixture returned the wrong destination slot');
  assert(typeof decision?.reason === 'string' && decision.reason.length > 0, 'reroute fixture omitted its reason');

  process.stdout.write(`[cycleforge-inference] PASS latencyMs=${latencyMs} route=A01->B02\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[cycleforge-inference] FAIL ${message}`);
  process.exit(1);
}
