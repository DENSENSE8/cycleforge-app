/** GET /api/interop/epcis — the tenant's event history as GS1 EPCIS 2.0 events. */

import { NextResponse, type NextRequest } from 'next/server';
import { withAuth } from '@/lib/auth/withAuth';
import {
  decodeEpcisCursor,
  projectEpcisPage,
  EPCIS_PAGE_DEFAULT,
  EPCIS_PAGE_MAX,
} from '@/lib/interop/epcis-projection';
import { fetchEpcisEvents } from '@/lib/interop/epcis-queries';
import { resolveOrgGs1Identity } from '@/lib/interop/org-gs1';

/** `null` when absent or unparseable — a bad `since` reads the whole feed. */
function parseSince(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const GET = withAuth(
  async (request: NextRequest, ctx) => {
    const orgId = ctx.organizationId;
    if (!orgId) {
      return NextResponse.json({ error: 'NO_ORGANIZATION' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    const limitRaw = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0
      ? Math.min(Math.floor(limitRaw), EPCIS_PAGE_MAX)
      : EPCIS_PAGE_DEFAULT;

    const identity = await resolveOrgGs1Identity(orgId);

    const result = await projectEpcisPage(
      {
        orgId,
        identity,
        since: parseSince(searchParams.get('since')),
        cursor: decodeEpcisCursor(searchParams.get('cursor')),
        limit,
      },
      { fetchEvents: fetchEpcisEvents },
    );

    return NextResponse.json({
      '@context': ['https://ref.gs1.org/standards/epcis/epcis-context.jsonld'],
      type: 'EPCISDocument',
      schemaVersion: '2.0',
      // The document's own creation instant — the moment this page was built,
      // not the moment anything happened on the floor.
      creationDate: new Date().toISOString(),
      epcisBody: { eventList: result.events },
      cycleforge_page: {
        nextCursor: result.nextCursor,
        count: result.events.length,
        limit,
        ...result.meta,
      },
    });
  },
  { permission: 'interop.read' },
);
