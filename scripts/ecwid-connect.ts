/**
 * Connect Ecwid for an org — write the `organization_integrations` vault row
 * that makes the connector orchestrator SEE this tenant.
 *
 * Why this is required and not cosmetic: `connectedOrgsForProvider()` in
 * `connectors/orchestrator.ts` resolves the orgs a cron will sync from
 * `organization_integrations WHERE provider = 'ecwid' AND status = 'active'`.
 * The `ECWID_*` env vars are a DOGFOOD-ONLY fallback consulted deep inside the
 * fetch (`isPlanFeatureExemptOrg`), never by the orchestrator — so without a
 * vault row the scheduled sync iterates zero orgs and reports success having
 * imported nothing. That silent-no-op is the failure this script prevents.
 *
 * Credentials are VALIDATED against the live Ecwid API before they are stored:
 * a vault row holding a dead token is worse than no row, because the cron then
 * fails every 15 minutes instead of being obviously unconfigured.
 *
 * Usage:
 *   pnpm ecwid:connect              # validate + report, writes nothing
 *   pnpm ecwid:connect -- --apply   # validate, then upsert the vault row
 */
import pool from '@/lib/db';
import { DOGFOOD_ORG_ID, type OrgId } from '@/lib/tenancy/constants';
import {
  getIntegrationCredentials,
  upsertIntegrationCredentials,
  type EcwidCredentials,
} from '@/lib/integrations/credentials';

const APPLY = process.argv.includes('--apply');
const ORG_ID = DOGFOOD_ORG_ID as OrgId;

function line(s = '') {
  process.stdout.write(`${s}\n`);
}

/** Live credential check — returns the store's order count, or throws. */
async function validate(storeId: string, apiToken: string): Promise<number> {
  const res = await fetch(`https://app.ecwid.com/api/v3/${storeId}/orders?limit=1`, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });
  if (!res.ok) {
    throw new Error(`Ecwid API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = (await res.json()) as { total?: number };
  return Number(data.total ?? 0);
}

async function main() {
  line(`Ecwid connect — org ${ORG_ID}${APPLY ? '' : '   [DRY RUN]'}`);

  const existing = await getIntegrationCredentials<EcwidCredentials>(ORG_ID, 'ecwid');
  line(`existing vault row: ${existing ? 'yes' : 'NONE'}`);

  const storeId = (process.env.ECWID_STORE_ID ?? '').trim();
  const apiToken = (process.env.ECWID_API_TOKEN ?? '').trim();
  if (!storeId || !apiToken) {
    line('ECWID_STORE_ID / ECWID_API_TOKEN missing from the environment — nothing to vault.');
    await pool.end();
    process.exit(1);
  }
  // Never print the token; the store id alone identifies the connection.
  line(`env credentials: storeId=${storeId} token=***${apiToken.slice(-4)}`);

  const total = await validate(storeId, apiToken);
  line(`validated against live Ecwid API — store reports ${total} orders`);

  if (!APPLY) {
    line('\n--apply not set; vault not written.');
    await pool.end();
    return;
  }

  await upsertIntegrationCredentials({
    orgId: ORG_ID,
    provider: 'ecwid',
    payload: { storeId, apiToken } satisfies EcwidCredentials,
    displayLabel: `Ecwid store ${storeId}`,
  });
  line('vault row upserted (status=active)');

  // Prove the round trip: the connector reads what the orchestrator will read.
  const readback = await getIntegrationCredentials<EcwidCredentials>(ORG_ID, 'ecwid');
  line(
    `readback: ${readback?.storeId === storeId && readback?.apiToken === apiToken ? 'OK — decrypts to the same credentials' : 'MISMATCH'}`,
  );

  const { rows } = await pool.query<{ organization_id: string }>(
    `SELECT DISTINCT organization_id FROM organization_integrations
      WHERE provider = 'ecwid' AND status = 'active'`,
  );
  line(`orchestrator will now sync ${rows.length} org(s): ${rows.map((r) => r.organization_id).join(', ')}`);
  await pool.end();
}

main().catch((err) => {
  console.error('ecwid-connect failed:', err);
  process.exit(1);
});
