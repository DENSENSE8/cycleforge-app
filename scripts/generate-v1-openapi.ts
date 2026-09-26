import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildV1OpenApi } from '../src/lib/api/v1-openapi';

async function main(): Promise<void> {
  const output = resolve(process.cwd(), 'docs/openapi/cycleforge-v1.json');
  await writeFile(output, `${JSON.stringify(buildV1OpenApi(), null, 2)}\n`);
}
void main();
