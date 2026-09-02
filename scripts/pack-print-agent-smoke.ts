/**
 * Local pack-print smoke: load .env.local and dispatchPrintBundle for the
 * Pack print E2E order so NAS agent → CUPS is exercised without a browser.
 *
 *   node --import tsx --env-file=.env --env-file=.env.local scripts/pack-print-agent-smoke.ts
 */
import { dispatchPrintBundle } from '../src/lib/documents/print-bundle';
import { isPrintAgentConfigured } from '../src/lib/print/dispatchAgentPdf';
import type { OrgId } from '../src/lib/tenancy/constants';

const ORG = '00000000-0000-0000-0000-000000000001' as OrgId;
const ORDER_ID = Number(process.env.PACK_PRINT_ORDER_ID || 13405);

async function main() {
  console.log('agentConfigured', isPrintAgentConfigured());
  console.log('NAS_AGENT_URL', (process.env.NAS_AGENT_URL || '').trim());
  const out = await dispatchPrintBundle(ORG, {
    orderId: ORDER_ID,
    packerLogId: null,
    actorStaffId: null,
    reprint: true,
  });
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
