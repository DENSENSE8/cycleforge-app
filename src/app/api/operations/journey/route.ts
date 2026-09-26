import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import { withTenantTransaction } from '@/lib/tenancy/db';
import {
  resolveEntity,
  readJourneyEntity,
  readJourneyBrowse,
  readSerialProvenance,
  clampLimit,
  decodeCursor,
  encodeCursor,
  resolveBrowseSources,
  redactAuditDiffs,
  JOURNEY_SOURCES,
  type JourneyDimension,
  type JourneyFilters,
  type JourneySource,
} from '@/lib/operations/journey';

/** GET /api/operations/journey — the Master Operations Journey reader. */

const DIMENSIONS: readonly JourneyDimension[] = ['order', 'serial', 'tracking', 'unit'];

function parseDimension(raw: string | null): JourneyDimension {
  return DIMENSIONS.includes(raw as JourneyDimension) ? (raw as JourneyDimension) : 'order';
}

function csv(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseSources(raw: string | null): JourneySource[] | undefined {
  const vals = csv(raw)
    .map((s) => s.toLowerCase())
    .filter((s): s is JourneySource => (JOURNEY_SOURCES as readonly string[]).includes(s));
  return vals.length ? vals : undefined;
}

function parseStaffId(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function entityParamForDim(dim: JourneyDimension, searchParams: URLSearchParams): string | null {
  if (dim === 'order') return searchParams.get('order');
  if (dim === 'serial') return searchParams.get('serial');
  if (dim === 'unit') return searchParams.get('unit');
  return searchParams.get('tracking');
}

export const GET = withAuth(
  async (request: NextRequest, ctx) => {
    try {
      const { searchParams } = new URL(request.url);
      const orgId = ctx.organizationId;

      const dim = parseDimension(searchParams.get('dim'));
      const entityValue = entityParamForDim(dim, searchParams);

      const filters: JourneyFilters = {
        from: searchParams.get('from'),
        to: searchParams.get('until') || searchParams.get('to'),
        stations: csv(searchParams.get('stations')),
        types: csv(searchParams.get('types')),
        staffId: parseStaffId(searchParams.get('staffId')),
        status: searchParams.get('status') || null,
        sources: parseSources(searchParams.get('sources')),
        q: searchParams.get('q') || null,
        limit: clampLimit(Number(searchParams.get('limit'))),
      };

      // Field-level audit diffs (before/after values) are admin-only (plan
      // Decision §3.2 Option B). Computed once; drives both the browse-spine
      // gate and the entity/browse diff redaction below.
      const canViewAudit = ctx.permissions.has('admin.view_logs');

      // BROWSE mode — no record number → serve the org-wide, filterable,
      // keyset-paginated event feed instead of the legacy 400 (plan §3.1).
      if (!entityValue || !entityValue.trim()) {
        // Audit-spine gate (plan Decision §3.2 Option B): admin-only in browse.
        const gate = resolveBrowseSources(filters.sources, canViewAudit);
        if (gate.forbidden) {
          return NextResponse.json(
            {
              success: false,
              error: 'The audit spine requires the admin.view_logs permission',
              code: 'AUDIT_SOURCE_FORBIDDEN',
            },
            { status: 403 },
          );
        }

        const cursor = decodeCursor(searchParams.get('cursor'));
        const { events, nextCursor } = await withTenantTransaction(orgId, (client) =>
          readJourneyBrowse(client, orgId, { ...filters, sources: gate.sources }, cursor),
        );

        return NextResponse.json({
          success: true,
          mode: 'browse',
          events: redactAuditDiffs(events, canViewAudit),
          nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
          limit: filters.limit,
        });
      }

      const result = await withTenantTransaction(orgId, async (client) => {
        const anchors = await resolveEntity(client, orgId, dim, entityValue);
        if (!anchors) return { notFound: true as const };
        const [events, serialProvenance] = await Promise.all([
          readJourneyEntity(client, orgId, anchors, filters),
          readSerialProvenance(client, orgId, anchors.serialUnitIds),
        ]);
        return { notFound: false as const, anchors: { ...anchors, serialProvenance }, events };
      });

      if (result.notFound) {
        return NextResponse.json({ success: false, error: 'Record not found' }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        mode: 'entity',
        entity: result.anchors,
        events: redactAuditDiffs(result.events, canViewAudit),
        nextCursor: null,
        limit: filters.limit,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read journey';
      console.error('[GET /api/operations/journey] error:', error);
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { permission: 'operations.view' },
);
