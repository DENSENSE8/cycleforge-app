import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildLabelIngestionOpenApi } from '../src/lib/label-ingestions/contracts';

async function main(): Promise<void> {
  const output = resolve(process.cwd(), 'docs/openapi/cycleforge-v1.json');
  await writeFile(output, `${JSON.stringify(buildLabelIngestionOpenApi(), null, 2)}\n`);
}
void main();
