import { requirePermission } from '@/lib/auth/page-guard';
import { tenantQuery } from '@/lib/tenancy/db';
import { processReturnsIntake } from '@/lib/inventory/returns';
import { parseScannedUrl } from '@/lib/scan-resolver';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/pane-header';
import { Panel, Button } from '@/design-system/primitives';
import { AdminTable, type AdminTableColumn } from '@/design-system/components/AdminTable';

export const dynamic = 'force-dynamic';

/**
 * /admin/inventory/returns
 *
 * Operations tool for Phase 7's returns dock.
 *
 * Top form: paste one or more serials (newline OR comma separated) +
 * optional tracking number + reason. Server action splits the textarea,
 * resolves GS1 URLs via parseScannedUrl, and calls processReturnsIntake.
 *
 * Recent returns table: last 50 inventory_events of type='RETURNED',
 * with each unit linked through to its timeline.
 */

interface RecentReturnRow {
  id: number;
  occurred_at: Date;
  serial_unit_id: number | null;
  sku: string | null;
  prev_status: string | null;
  scan_token: string | null;
  notes: string | null;
  payload: Record<string, unknown> | null;
  actor_name: string | null;
}

/**
 * Recent RETURNED events for the signed-in operator's tenant.
 *
 * `tenantQuery` (app.current_org GUC) AND the explicit `organization_id`
 * predicates, both: the GUC is the backstop for a forgotten filter, not a
 * substitute for one — `tenantPool` still aliases the BYPASSRLS owner role, so
 * today the predicate is the only thing actually isolating this read. The
 * staff join is narrowed too, so a cross-org `actor_staff_id` yields a NULL
 * name (LEFT JOIN — the return row itself is never dropped) instead of
 * leaking another tenant's staff name.
 */
async function loadRecentReturns(orgId: string): Promise<RecentReturnRow[]> {
  try {
    const { rows } = await tenantQuery<RecentReturnRow>(
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
    return rows;
  } catch {
    return [];
  }
}

async function intakeAction(formData: FormData): Promise<void> {
  'use server';
  // A Server Action is independently POST-able: the `requirePermission` call in
  // the page component below gates RENDERING, never action invocation. Gate
  // here — and outside the intake's catch below, so the guard's own redirect
  // reaches the caller instead of being swallowed as an intake failure.
  //
  // The permission is the MUTATION's, not the page's. `admin.view` is what
  // gates rendering; the twin entrypoint POST /api/returns/intake enforces
  // `receiving.mark_received` for the identical write. `admin.view` is an
  // ordinary registry permission — a non-admin role, or a per-staff
  // `permissions_added` grant, can carry it without carrying
  // `receiving.mark_received` — so gating the action on the page's permission
  // makes this form the weaker of two doors onto the same code path.
  const user = await requirePermission('receiving.mark_received', { enforce: true });

  const serialsText = String(formData.get('serials') ?? '').trim();
  const tracking = String(formData.get('tracking') ?? '').trim() || null;
  const reason = String(formData.get('reason') ?? '').trim() || null;
  if (!serialsText) {
    redirect('/admin/inventory/returns?error=missing_serials');
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

  // The catch is scoped to the intake call itself, and every redirect() below
  // sits outside it. redirect() signals by THROWING a NEXT_REDIRECT error, so a
  // bare `catch` around it swallows the redirect: the 404 branch's
  // `?error=not_found&missing=…` used to throw straight into the catch, get
  // logged as an intake failure, and land on the generic `?error=failed` — so
  // the operator never saw which serials failed to resolve, and the UI that
  // renders that list was unreachable. Narrowing the catch is the fix.
  const result = await processReturnsIntake({
    serials: normalizedSerials,
    serialUnitIds,
    trackingNumber: tracking,
    reason,
    actorStaffId: null,
    // Tenant safety, not just filtering. This is now a REQUIRED, un-defaulted
    // field on ReturnsIntakeInput, so omitting it is a compile error rather
    // than a silent escalation — which is what it used to be: with it absent
    // the intake ran on the BYPASSRLS owner pool with both org predicates
    // collapsed, so the serial resolver matched any tenant's serial_units row
    // and the order_unit_allocations SHIPPED→RETURNED flip ran unpredicated.
    // That org-less branch no longer exists in returns.ts; the requirement is
    // what keeps it from coming back.
    organizationId: user.organizationId,
  }).catch((err: unknown) => {
    console.error('[returns.intake] failed:', err);
    return null;
  });

  if (!result) {
    redirect('/admin/inventory/returns?error=failed');
  }

  if (!result.ok) {
    const missing = [
      ...(result.missingSerials ?? []),
      ...(result.missingIds?.map(String) ?? []),
    ];
    const detail = missing.length > 0 ? `&missing=${encodeURIComponent(missing.join(','))}` : '';
    redirect(`/admin/inventory/returns?error=${result.status === 404 ? 'not_found' : 'failed'}${detail}`);
  }

  revalidatePath('/admin/inventory/returns');
  redirect('/admin/inventory/returns?ok=1');
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

  const returnColumns: AdminTableColumn<RecentReturnRow>[] = [
    {
      key: 'when',
      header: 'When',
      type: 'date',
      cell: (r) => (
        <span className="whitespace-nowrap text-xs text-text-soft">
          {new Date(r.occurred_at).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'unit',
      header: 'Unit',
      type: 'id',
      cell: (r) =>
        r.serial_unit_id ? (
          <Link
            href={`/admin/inventory/units/${r.serial_unit_id}`}
            className="font-mono text-xs text-blue-600 hover:underline"
          >
            #{r.serial_unit_id}
          </Link>
        ) : (
          '—'
        ),
    },
    {
      key: 'sku',
      header: 'SKU',
      type: 'id',
      cell: (r) =>
        r.sku ? (
          <Link
            href={`/admin/inventory/sku/${encodeURIComponent(r.sku)}`}
            className="font-mono text-xs text-blue-600 hover:underline"
          >
            {r.sku}
          </Link>
        ) : (
          '—'
        ),
    },
    {
      key: 'prev',
      header: 'Prev',
      type: 'tag',
      cell: (r) => <span className="text-xs text-text-muted">{r.prev_status ?? '—'}</span>,
    },
    {
      key: 'tracking',
      header: 'Tracking',
      type: 'id',
      cell: (r) => (
        <span className="font-mono text-role-caption text-text-muted">{r.scan_token ?? '—'}</span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      type: 'longtext',
      cell: (r) => {
        const orderId = (r.payload as { order_id?: number | null })?.order_id ?? null;
        return (
          <span className="text-xs text-text-muted">
            {r.notes ?? '—'}
            {orderId ? <span className="ml-1 text-text-faint">· ord#{orderId}</span> : null}
          </span>
        );
      },
    },
    {
      key: 'by',
      header: 'By',
      type: 'text',
      cell: (r) => <span className="text-xs text-text-muted">{r.actor_name ?? 'system'}</span>,
    },
  ];

  return (
    <div className="min-h-screen bg-surface-canvas">
      <PageHeader backHref="/admin/inventory" title="Returns intake" />
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
          <AdminTable
            columns={returnColumns}
            rows={recent}
            rowKey={(r) => r.id}
            emptyMessage="No returns recorded yet."
          />
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
