/** Bounded repair command for the Receiving unit projection. Requires one org. */
import { refreshAllReceivingUnitStageFacts, refreshReceivingUnitStageFacts } from '@/lib/receiving/receiving-unit-stage-facts';
import type { OrgId } from '@/lib/tenancy/constants';

function values(flag: string): string[] {
  const out: string[] = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) out.push(process.argv[index + 1]!);
  }
  return out;
}

const org = values('--org')[0] ?? '';
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(org)) {
  console.error('Usage: ... rebuild-receiving-unit-stage-facts.ts --org <uuid> [--line <id> ...]');
  process.exit(2);
}

async function main(): Promise<void> {
  const lineIds = values('--line')
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
  const changed = lineIds.length > 0
    ? await refreshReceivingUnitStageFacts(org as OrgId, { lineIds })
    : await refreshAllReceivingUnitStageFacts(org as OrgId);

  console.log(JSON.stringify({ organizationId: org, lineIds, changed }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
