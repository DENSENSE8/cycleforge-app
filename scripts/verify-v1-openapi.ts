import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildV1OpenApi } from '../src/lib/api/v1-openapi';
async function main(): Promise<void> {
  const path = resolve(process.cwd(), 'docs/openapi/cycleforge-v1.json');
  const expected = `${JSON.stringify(buildV1OpenApi(), null, 2)}\n`;
  const actual = await readFile(path, 'utf8');
  if (actual !== expected) throw new Error('OpenAPI artifact is stale. Run: pnpm exec tsx scripts/generate-v1-openapi.ts');
  console.log('V1 OpenAPI contract is current.');
}
void main();
