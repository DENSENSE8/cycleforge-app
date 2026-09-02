import { createHash, randomBytes } from 'node:crypto';

export function generateTestRunId(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `qa_${y}${m}${d}_${randomBytes(3).toString('hex')}`;
}

export function hashPayload(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16);
}
