import { requirePermission } from '@/lib/auth/page-guard';
import { tenantQuery } from '@/lib/tenancy/db';
import { processReturnsIntake } from '@/lib/inventory/returns';
import { parseScannedUrl } from '@/lib/scan-resolver';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/pane-header';
import { Panel, Button } from '@/design-system/primitives';
import { RecentReturnsTable } from './RecentReturnsTable';
import {
  toRecentReturnRow,
  type RecentReturnQueryRow,
  type RecentReturnRow,
} from '@/lib/inventory/returns-row';

export const dynamic = 'force-dynamic';

/** /inventory/returns */

/** Recent RETURNED events for the signed-in operator's tenant. */
async function loadRecentReturns(orgId: string): Promise<RecentReturnRow[]> {
  try {
    const { rows } = await tenantQuery<RecentReturnQueryRow>(
      orgId,
      `SELECT ie.id, ie.occurred_at,
              ie.serial_unit_id, ie.sku,
              ie.prev_status, ie.scan_token, ie.notes, ie.payload,
              s.name AS actor_name
         FROM inventory_events ie
         LEFT JOIN staff s
           ON s.id = ie.actor_staff_id
          AND s.organization_id = $1::uuid
        WHERE ie.event_type = 'RETURNED'
          AND ie.organization_id = $1::uuid
        ORDER BY ie.occurred_at DESC, ie.id DESC
        LIMIT 50`,
      [orgId],
    );
    return rows.map(toRecentReturnRow);
  } catch {
    return [];
  }
}

async function intakeAction(formData: FormData): Promise<void> {
  'use server';
  // A Server Action is independently POST-able:
  const user = await requirePermission('receiving.mark_received', { enforce: true });

  const serialsText = String(formData.get('serials') ?? '').trim();
  const tracking = String(formData.get('tracking') ?? '').trim() || null;
  const reason = String(formData.get('reason') ?? '').trim() || null;
  if (!serialsText) {
    redirect('/inventory/returns?error=missing_serials');
  }

  // Accept comma or newline separation. Drop empties.
  const rawSerials = serialsText
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  // Resolve GS1 Digital Link URLs, plus split id-shaped entries from
  // serial-shaped entries.
  const serialUnitIds: number[] = [];
  const normalizedSerials: string[] = [];
  for (const raw of rawSerials) {
    const n = Number(raw);
    if (Number.isInteger(n) && n > 0 && String(n) === raw) {
      serialUnitIds.push(n);
      continue;
    }
    const url = parseScannedUrl(raw);
    normalizedSerials.push(
      url && url.type === 'unit' ? url.unitSerial.toUpperCase() : raw.toUpperCase(),
    );
  }

  // The catch is scoped to the intake call itself, and every redirect() below sits outside it.
  const result = await processReturnsIntake({
    serials: normalizedSerials,
    serialUnitIds,
    trackingNumber: tracking,
    reason,
    actorStaffId: null,
    // Tenant safety, not just filtering.
    organizationId: user.organizationId,
  }).catch((err: unknown) => {
    console.error('[returns.intake] failed:', err);
    return null;
  });

  if (!result) {
    redirect('/inventory/returns?error=failed');
  }

  if (!result.ok) {
    const missing = [
      ...(result.missingSerials ?? []),
      ...(result.missingIds?.map(String) ?? []),
    ];
    const detail = missing.length > 0 ? `&missing=${encodeURIComponent(missing.join(','))}` : '';
    redirect(`/inventory/returns?error=${result.status === 404 ? 'not_found' : 'failed'}${detail}`);
  }

  revalidatePath('/inventory/returns');
  redirect('/inventory/returns?ok=1');
}

export default async function ReturnsIntakeAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; missing?: string }>;
}) {
  const user = await requirePermission('admin.view', { enforce: true });

  const params = await searchParams;
  const okFlash = params.ok === '1';
  const errorCode = params.error ?? null;
  const missing = params.missing ?? null;
  const recent = await loadRecentReturns(user.organizationId);

  return (
    <div className="min-h-screen bg-surface-canvas">
      <PageHeader backHref="/inventory/health" title="Returns intake" />
      <div className="space-y-6 p-8">
        <p className="text-sm text-text-muted">
          Receive units back into the warehouse. Each scanned serial gets a
          <code className="mx-1 rounded bg-surface-sunken px-1 py-0.5 text-xs">RETURNED</code>
          event, transitions to that state, and produces a
          <code className="mx-1 rounded bg-surface-sunken px-1 py-0.5 text-xs">RETURN_CUSTOMER</code>
          ledger row.
        </p>

        {okFlash ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
            Return intake recorded. See <strong>Recent returns</strong> below.
          </div>
        ) : null}

        {errorCode ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {errorCode === 'missing_serials' && 'Paste at least one serial or unit id.'}
            {errorCode === 'not_found' && (
              <>
                Some serials/ids didn&apos;t match any <code className="rounded bg-red-100 px-1 py-0.5 text-xs">serial_units</code> row.
                {missing ? <> Missing: <code className="rounded bg-red-100 px-1 py-0.5 text-xs">{missing}</code></> : null}
              </>
            )}
            {errorCode === 'failed' && 'Intake failed. Check server logs.'}
            {!['missing_serials', 'not_found', 'failed'].includes(errorCode) && 'Action failed.'}
          </div>
        ) : null}

        {/* Intake form */}
        <Panel radius="lg" padding="none">
          <header className="border-b border-border-hairline px-6 py-3">
            <h2 className="text-base font-medium text-text-default">Record a return</h2>
          </header>
          <form action={intakeAction} className="space-y-3 px-6 py-4">
            <div>
              <label htmlFor="serials" className="block text-xs font-medium text-text-muted">
                Serials / unit ids (one per line, or comma-separated)
              </label>
              <textarea
                id="serials"
                name="serials"
                rows={4}
                placeholder={'IPH13-128-BLU-2026-000142\n12345\nhttps://app.example/01/02000000001236/21/IPH13-128-BLU-2026-000142'}
                className="mt-1 block w-full rounded-md border border-border-default px-3 py-2 font-mono text-xs"
              />
              <p className="mt-1 text-role-caption text-text-soft">
                Numeric values are treated as <code>serial_units.id</code>. Everything else as a serial number
                (GS1 Digital Link URLs are auto-extracted).
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="tracking" className="block text-xs font-medium text-text-muted">
                  Return tracking number (optional)
                </label>
                <input
                  id="tracking"
                  name="tracking"
                  placeholder="1Z..."
                  className="mt-1 block w-full rounded-md border border-border-default px-3 py-1.5 font-mono text-xs"
                />
              </div>
              <div>
                <label htmlFor="reason" className="block text-xs font-medium text-text-muted">
                  Reason (optional)
                </label>
                <input
                  id="reason"
                  name="reason"
                  placeholder="customer return"
                  className="mt-1 block w-full rounded-md border border-border-default px-3 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <Button
                variant="primary"
                size="sm"
                type="submit"
                className="bg-orange-600 hover:bg-orange-500 active:bg-orange-700 shadow-orange-600/25"
              >
                Record intake
              </Button>
              <p className="text-role-caption text-text-soft">
                After intake, run the triage flow to re-enter refurb if applicable.
              </p>
            </div>
          </form>
        </Panel>

        {/* Recent returns */}
        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-text-default">Recent returns</h2>
            <span className="text-xs text-text-soft">last 50</span>
          </header>
          <RecentReturnsTable rows={recent} />
        </section>

        <footer className="text-xs text-text-soft">
          Intake runs through{' '}
          <code className="rounded bg-surface-sunken px-1 py-0.5">src/lib/inventory/returns.ts</code>
          {' '}— same code path as <code className="rounded bg-surface-sunken px-1 py-0.5">POST /api/returns/intake</code>.
        </footer>
      </div>
    </div>
  );
}
