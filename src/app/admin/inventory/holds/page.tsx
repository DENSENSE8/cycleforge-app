import { requirePermission } from '@/lib/auth/page-guard';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { holdUnit, releaseUnit } from '@/lib/inventory/hold';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/pane-header';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Panel, Button } from '@/design-system/primitives';
import { DataTable, type DataTableColumn } from '@/design-system/components/DataTable';

export const dynamic = 'force-dynamic';

/**
 * /admin/inventory/holds
 *
 * Operations tool for Phase 7's quarantine workflow.
 *
 *   - Hold form (top): enter a serial_unit_id or normalized serial,
 *     a reason; submits to holdUnit().
 *   - Held-units table: every serial_units row where current_status =
 *     'ON_HOLD', with a Release button + optional force-status select.
 *     Submits to releaseUnit().
 *
 * Both server actions use the same code path as
 * /api/serial-units/[id]/{hold,release}.
 *
 * Permission gate: `admin.view` at render time, and `sku_stock.adjust` inside
 * EACH server action. A server action is its own POST entrypoint — the page's
 * render-time guard does not gate it, so "the action enforces it implicitly by
 * being in this admin-only page" (what this docblock claimed until 2026-08-21)
 * was never true. `sku_stock.adjust` is the permission the twin routes
 * /api/serial-units/[id]/{hold,release} enforce, and `hold.ts` names the
 * permission gate a caller responsibility.
 *
 * Tenant scoping: the held-units read and both server actions' ref lookups go
 * through `tenantQuery(orgId, …)` with an explicit `organization_id` predicate,
 * and `orgId` comes from the auth ctx (`requirePermission` →
 * `user.organizationId`) — never from the form body. Nothing an operator types
 * here is org-bearing: a unit id, a normalized serial and a status enum all
 * collide across tenants, so a bare owner-pool read listed every tenant's held
 * units and let an admin in org A hold or release a unit in org B (RLS does not
 * bite on the owner pool). Live until 2026-08-21.
 *
 * Note the actions resolve the ref to an org-owned `serial_units.id` BEFORE
 * calling `holdUnit` / `releaseUnit` — those helpers take no orgId of their own
 * (a tracked follow-up in `src/lib/inventory/hold.ts`), so this page's ownership
 * check is what keeps the write inside the caller's tenant.
 */

interface HeldUnitRow {
  id: number;
  serial_number: string;
  sku: string | null;
  condition_grade: string | null;
  notes: string | null;
  hold_reason: string | null;
  restore_status: string | null;
  held_at: Date | null;
  held_by_name: string | null;
}

async function loadHeldUnits(orgId: OrgId): Promise<HeldUnitRow[]> {
  try {
    const r = await tenantQuery<HeldUnitRow>(
      orgId,
      `SELECT su.id, su.serial_number, su.sku,
              su.condition_grade::text AS condition_grade,
              su.notes,
              h.notes               AS hold_reason,
              h.payload->>'restore_status' AS restore_status,
              h.occurred_at         AS held_at,
              s.name                AS held_by_name
         FROM serial_units su
         LEFT JOIN LATERAL (
           SELECT ie.notes, ie.payload, ie.occurred_at, ie.actor_staff_id
             FROM inventory_events ie
            WHERE ie.serial_unit_id = su.id
              AND ie.event_type = 'HELD'
              AND ie.organization_id = $1
            ORDER BY ie.occurred_at DESC, ie.id DESC
            LIMIT 1
         ) h ON TRUE
         LEFT JOIN staff s ON s.id = h.actor_staff_id AND s.organization_id = $1
        WHERE su.current_status = 'ON_HOLD'::serial_status_enum
          AND su.organization_id = $1
        ORDER BY h.occurred_at DESC NULLS LAST, su.id DESC
        LIMIT 200`,
      [orgId],
    );
    return r.rows;
  } catch {
    return [];
  }
}

/**
 * Resolve a "unit id or serial" operator ref to a serial_units.id the CALLER'S
 * ORG owns, or 0. Both branches carry the org predicate: the numeric branch
 * matters just as much as the serial one, since a raw id typed into the form
 * (or posted straight at the server action) is otherwise a cross-tenant handle.
 */
async function resolveOwnedUnitId(refRaw: string, orgId: OrgId): Promise<number> {
  const numeric = Number(refRaw);
  const byId = Number.isInteger(numeric) && numeric > 0;
  try {
    const r = await tenantQuery<{ id: number }>(
      orgId,
      byId
        ? `SELECT id FROM serial_units
            WHERE id = $1 AND organization_id = $2 LIMIT 1`
        : `SELECT id FROM serial_units
            WHERE normalized_serial = UPPER(TRIM($1)) AND organization_id = $2 LIMIT 1`,
      [byId ? numeric : refRaw, orgId],
    );
    return r.rows[0]?.id ?? 0;
  } catch {
    return 0;
  }
}

// ─── Server actions ────────────────────────────────────────────────────────

async function holdAction(formData: FormData): Promise<void> {
  'use server';
  const refRaw = String(formData.get('ref') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  if (!refRaw || !reason) {
    redirect('/admin/inventory/holds?error=missing_input');
  }

  // A server action is its own POST entrypoint — the page's render-time guard
  // does not gate it, so this re-gates permission AND takes the org from the
  // session here, never from the form.
  const user = await requirePermission('sku_stock.adjust', { enforce: true });

  // ref may be either a numeric id or a serial string; either way it only
  // resolves against units this org owns.
  const serialUnitId = await resolveOwnedUnitId(refRaw, user.organizationId);
  if (serialUnitId <= 0) {
    redirect('/admin/inventory/holds?error=not_found');
  }

  try {
    await holdUnit({ serialUnitId, reason, actorStaffId: null, organizationId: user.organizationId });
  } catch (err) {
    console.error('[holds.hold] failed:', err);
  }
  revalidatePath('/admin/inventory/holds');
}

async function releaseAction(formData: FormData): Promise<void> {
  'use server';
  const id = Number(formData.get('serialUnitId'));
  const forceStatus = String(formData.get('forceStatus') ?? '').trim() || null;
  const reason = String(formData.get('reason') ?? '').trim() || null;
  if (!Number.isFinite(id) || id <= 0) return;

  const user = await requirePermission('sku_stock.adjust', { enforce: true });

  // The id arrives from the form, so re-check ownership before the write. The
  // org is threaded into releaseUnit() as well, so the unit lock and the
  // RELEASED_HOLD event are both scoped — this pre-check is defence in depth,
  // not the only boundary any more.
  const serialUnitId = await resolveOwnedUnitId(String(id), user.organizationId);
  if (serialUnitId <= 0) return;

  try {
    await releaseUnit({
      serialUnitId,
      reason,
      forceStatus,
      actorStaffId: null,
      organizationId: user.organizationId,
    });
  } catch (err) {
    console.error('[holds.release] failed:', err);
  }
  revalidatePath('/admin/inventory/holds');
}

const RESTORE_OPTIONS = [
  '', // = auto (use payload.restore_status)
  'STOCKED', 'TRIAGED', 'IN_REPAIR', 'REPAIR_DONE', 'IN_TEST',
  'GRADED', 'ALLOCATED', 'PICKED', 'PACKED', 'LABELED', 'STAGED',
] as const;

export default async function HoldsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requirePermission('admin.view', { enforce: true });

  const params = await searchParams;
  const errorCode = params.error ?? null;
  const held = await loadHeldUnits(user.organizationId);

  const heldColumns: DataTableColumn<HeldUnitRow>[] = [
    {
      key: 'unit',
      header: 'Unit',
      type: 'id',
      cell: (h) => (
        <Link
          href={`/admin/inventory/units/${h.id}`}
          className="font-mono text-xs text-blue-600 hover:underline"
        >
          #{h.id} · {h.serial_number}
        </Link>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      type: 'id',
      cell: (h) => <span className="font-mono text-xs">{h.sku ?? '—'}</span>,
    },
    {
      key: 'restore',
      header: 'Restore to',
      type: 'tag',
      cell: (h) => (
        <span className="font-mono text-xs text-text-muted">{h.restore_status ?? 'STOCKED'}</span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      type: 'longtext',
      cell: (h) => <span className="text-xs text-text-muted">{h.hold_reason ?? '—'}</span>,
    },
    {
      key: 'held_at',
      header: 'Held at',
      type: 'date',
      cell: (h) => (
        <span className="text-xs text-text-soft">
          {h.held_at ? new Date(h.held_at).toLocaleString() : '—'}
        </span>
      ),
    },
    {
      key: 'by',
      header: 'By',
      type: 'text',
      cell: (h) => <span className="text-xs text-text-muted">{h.held_by_name ?? 'system'}</span>,
    },
    {
      key: 'release',
      header: 'Release',
      align: 'right',
      cell: (h) => (
        <form action={releaseAction} className="flex items-center justify-end gap-2">
          <input type="hidden" name="serialUnitId" value={h.id} />
          <HoverTooltip label="Override the auto-recovered restore status (blank = auto)" asChild>
            <select
              name="forceStatus"
              defaultValue=""
              aria-label="Override the auto-recovered restore status (blank = auto)"
              className="rounded border border-border-default px-2 py-1 text-xs"
            >
              {RESTORE_OPTIONS.map((s) => (
                <option key={s || 'auto'} value={s}>
                  {s || 'auto'}
                </option>
              ))}
            </select>
          </HoverTooltip>
          {/* ds-raw-button: solid-green success CTA — no success variant in Button */}
          <button
            type="submit"
            className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
          >
            Release
          </button>
        </form>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-surface-canvas">
      <PageHeader backHref="/admin/inventory" title="Holds" />
      <div className="space-y-6 p-8">
        <p className="text-sm text-text-muted">
          Quarantine units mid-flow. Held units keep their previous lifecycle state in the HELD event payload so a release rolls back automatically.
        </p>

        {errorCode ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {errorCode === 'missing_input' && 'Both unit ref and reason are required.'}
            {errorCode === 'not_found' && 'No serial_units row matched that ref.'}
            {!['missing_input', 'not_found'].includes(errorCode) && 'Action failed.'}
          </div>
        ) : null}

        {/* Hold form */}
        <Panel radius="lg" padding="none">
          <header className="border-b border-border-hairline px-6 py-3">
            <h2 className="text-base font-medium text-text-default">Place a unit on hold</h2>
          </header>
          <form action={holdAction} className="grid grid-cols-1 gap-3 px-6 py-4 md:grid-cols-[1fr_2fr_auto]">
            <div>
              <label htmlFor="ref" className="block text-xs font-medium text-text-muted">Unit id or serial</label>
              <input
                id="ref"
                name="ref"
                placeholder="42 or IPH13-2026-000142"
                className="mt-1 block w-full rounded-md border border-border-default px-3 py-1.5 font-mono text-xs"
              />
            </div>
            <div>
              <label htmlFor="reason" className="block text-xs font-medium text-text-muted">Reason</label>
              <input
                id="reason"
                name="reason"
                placeholder="e.g. damaged in handling, customer dispute"
                className="mt-1 block w-full rounded-md border border-border-default px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-end">
              <Button variant="danger" size="sm" type="submit">
                Place on hold
              </Button>
            </div>
          </form>
        </Panel>

        {/* Held units */}
        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-text-default">Units on hold</h2>
            <span className="text-xs text-text-soft">{held.length} held</span>
          </header>
          <DataTable
            columns={heldColumns}
            rows={held}
            rowKey={(h) => h.id}
            emptyMessage="No units currently on hold."
          />
        </section>

        <footer className="text-xs text-text-soft">
          Hold + release run through{' '}
          <code className="rounded bg-surface-sunken px-1 py-0.5">src/lib/inventory/hold.ts</code>
          {' '}— same code path as <code className="rounded bg-surface-sunken px-1 py-0.5">POST /api/serial-units/[id]/&#123;hold,release&#125;</code>.
        </footer>
      </div>
    </div>
  );
}
