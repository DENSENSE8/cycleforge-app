/**
 * Backfill ShipStation labels (PDF + tracking) into the label-ingestion ledger.
 *
 *   node --env-file=.env --import tsx --import ./scripts/register-server-only-shim.cjs \
 *     scripts/backfill-shipstation-labels.mts [--org=<uuid>] [--days=7] [--apply]
 *
 * Dry run by default: reads ShipStation (v1 shipments, v2 labels + PDF
 * downloads) and the ledger/orders, writes nothing, prints what `--apply`
 * would do. `--apply` stages PDFs in the ledger's object store, records ledger
 * rows, attaches tracking, stores the label documents, and finalizes rows.
 *
 * Retry-safe: idempotent on the ShipStation shipment id and PDF sha256; a
 * re-run finishes whatever a crashed run left MATCHED and promotes QUARANTINED
 * rows whose order has since landed. See
 * src/lib/label-ingestions/sources/shipstation-history.ts.
 */
import { DOGFOOD_ORG_ID, type OrgId } from '@/lib/tenancy/constants';
import { DEFAULT_BACKFILL_DAYS, runShipStationLabelBackfill } from '@/lib/label-ingestions/sources/shipstation-history';
import { createShipStationHistoryDeps } from '@/lib/label-ingestions/sources/shipstation-history-deps';

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

const apply = process.argv.includes('--apply');
const orgId = (arg('org') ?? DOGFOOD_ORG_ID) as OrgId;
const days = Number(arg('days') ?? DEFAULT_BACKFILL_DAYS);
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId)) {
  console.error(`--org must be a UUID (got ${orgId})`);
  process.exit(2);
}
if (!Number.isFinite(days) || days <= 0 || days > 90) {
  console.error(`--days must be in (0, 90] (got ${arg('days')})`);
  process.exit(2);
}

const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const report = await runShipStationLabelBackfill({ since, apply }, await createShipStationHistoryDeps(orgId));
const would = apply ? '' : 'would ';
const rows: Array<[string, unknown]> = [
  ['shipments seen', report.shipmentsSeen],
  ['voided skipped', report.voidedSkipped],
  ['return labels seen', report.returnLabels],
  [`${would}list returns on their order`, report.returnsListed],
  ['returns already listed', report.returnsKnown],
  ['returns unresolved', report.returnsUnresolved],
  ['no tracking skipped', report.noTrackingSkipped],
  ['stored by in-app purchase', report.purchasedInApp],
  ['already ingested', report.alreadyIngested],
  ['PDFs fetchable', report.pdfFetchable],
  ['PDFs unavailable', report.pdfUnavailable],
  [`${would}ingest (new rows)`, report.ingested],
  ['duplicate PDF bytes', report.duplicatePdf],
  [`${would}promote quarantined`, report.promoted],
  [`${would}attach tracking`, report.trackingAttached],
  ['tracking already current', report.trackingAlreadyCurrent],
  [`${would}apply (tracking + PDF)`, report.applied],
  [`${would}list on order labels`, report.listed],
  ['unresolved (exceptions)', report.unresolved],
  ['failed', report.failed],
];

console.log(`ShipStation label backfill — org ${orgId}, ${report.mode}, since ${report.since}`);
for (const [label, value] of rows) {
  console.log(`  ${label.padEnd(30)} ${typeof value === 'object' ? JSON.stringify(value) : value}`);
}
process.exit(report.failed > 0 ? 1 : 0);
