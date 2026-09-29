/**
 * The Exceptions hub — every source the caller may see, one list, one count
 * per kind. `GET /api/exceptions`, `GET /api/exceptions/[key]` and the nav
 * facets (`exceptions.<kind>`) all read here, so a count is the list's length
 * under the SAME source predicate, and a kind the caller may not see is
 * absent from rows, counts and records alike.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import type { PermissionString } from '@/lib/auth/permissions-shared';
import { exceptionRowMatches, pageExceptionRows } from './list-view';
import { visibleExceptionKinds } from './permissions';
import { exceptionSourceContext, type ExceptionRecord, type ExceptionSource } from './source';
import { binsSource } from './sources/bins';
import { claimSource, shortSource, unfoundSource } from './sources/cartons';
import { fbmSource } from './sources/fbm';
import { labelsSource } from './sources/labels';
import { pairsSource } from './sources/pairs';
import { paperworkSource } from './sources/paperwork';
import { trackingSource } from './sources/tracking';
import {
  EXCEPTION_KIND_SPEC,
  parseExceptionRowKey,
  type ExceptionKind,
  type ExceptionListParams,
  type ExceptionListResponse,
  type ExceptionRow,
} from './types';

export type ExceptionSources = Readonly<Record<ExceptionKind, ExceptionSource>>;

export const EXCEPTION_SOURCES: ExceptionSources = {
  fbm: fbmSource,
  labels: labelsSource,
  paperwork: paperworkSource,
  pairs: pairsSource,
  bins: binsSource,
  tracking: trackingSource,
  claim: claimSource,
  short: shortSource,
  unfound: unfoundSource,
};

export interface ExceptionCaller {
  orgId: OrgId;
  has: (permission: PermissionString) => boolean;
}

export async function listExceptions(
  caller: ExceptionCaller,
  params: ExceptionListParams,
  sources: ExceptionSources = EXCEPTION_SOURCES,
): Promise<ExceptionListResponse> {
  const ctx = exceptionSourceContext(caller.orgId);
  const visible = visibleExceptionKinds(caller.has);
  const listed = new Set(
    visible.filter(
      (kind) => (!params.kind || params.kind === kind) && (!params.domain || EXCEPTION_KIND_SPEC[kind].domain === params.domain),
    ),
  );
  const perKind = await Promise.all(
    visible.map(async (kind) => {
      // A listed kind's count is its list's length; the rest answer `count` —
      // the same source predicate either way.
      if (listed.has(kind)) {
        const rows = await sources[kind].list(ctx);
        return { kind, rows, count: rows.length };
      }
      return { kind, rows: [] as ExceptionRow[], count: await sources[kind].count(ctx) };
    }),
  );
  const counts: ExceptionListResponse['counts'] = {};
  for (const { kind, count } of perKind) counts[kind] = count;
  const page = pageExceptionRows(perKind.flatMap((entry) => entry.rows), params);
  return { rows: page.rows, counts, nextCursor: page.nextCursor };
}

export type ExceptionRecordResult =
  | { ok: true; record: ExceptionRecord }
  | { ok: false; status: 403 | 404; error: string };

export async function getExceptionRecord(
  caller: ExceptionCaller,
  key: string,
  sources: ExceptionSources = EXCEPTION_SOURCES,
): Promise<ExceptionRecordResult> {
  const parsed = parseExceptionRowKey(key);
  if (!parsed) return { ok: false, status: 404, error: 'Unknown exception' };
  if (!visibleExceptionKinds(caller.has).includes(parsed.kind)) {
    return { ok: false, status: 403, error: 'FORBIDDEN' };
  }
  const record = await sources[parsed.kind].record(exceptionSourceContext(caller.orgId), parsed.sourceId);
  return record ? { ok: true, record } : { ok: false, status: 404, error: 'This exception is resolved or gone' };
}

/**
 * Per-kind totals for the kinds the caller may see (`kinds` narrows further)
 * — the nav facets' read. With `q`, a total is the list's matched rows.
 */
export async function countExceptions(
  caller: ExceptionCaller,
  kinds: readonly ExceptionKind[] | null = null,
  q: string | null = null,
  sources: ExceptionSources = EXCEPTION_SOURCES,
): Promise<Partial<Record<ExceptionKind, number>>> {
  const ctx = exceptionSourceContext(caller.orgId);
  const needle = q?.trim() ?? '';
  const wanted = visibleExceptionKinds(caller.has).filter((kind) => kinds == null || kinds.includes(kind));
  const totals = await Promise.all(
    wanted.map(async (kind) => {
      const total = needle
        ? (await sources[kind].list(ctx)).filter((row) => exceptionRowMatches(row, needle)).length
        : await sources[kind].count(ctx);
      return [kind, total] as const;
    }),
  );
  return Object.fromEntries(totals) as Partial<Record<ExceptionKind, number>>;
}
