/**
 * Org-scoped Ask conversation facts.
 *
 * The operator's text is classification-only — never interpolated into SQL.
 * Organization and staff come from the signed-in session (`withAuth`), never
 * the request body. Every read is `tenantQuery` plus an explicit
 * `organization_id` predicate.
 */

import { resolveAiTimeframe } from '@/lib/ai/date-range';
import type { AiTimeframe } from '@/lib/ai/types';
import type { OrgId } from '@/lib/tenancy/constants';

export const ORG_CHAT_SYSTEM = [
  'You are Grok living in this warehouse workspace.',
  'Answer only from the live workspace facts in the user message.',
  'Those facts are already filtered to the signed-in organization. Never invent counts, names, or other tenants.',
  'Speak in plain floor language. Never cite internal ids (database keys, staff ids, receiving numbers).',
  'If the facts say no packer is signed in, say that. If the count is zero, say zero.',
  'Keep answers short and concrete.',
].join(' ');

export type OrgChatKind = 'session_packer_packages' | 'org_packages';

export interface OrgChatFactsDeps {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    orgId: OrgId,
    text: string,
    params?: ReadonlyArray<unknown>,
  ) => Promise<{ rows: T[] }>;
  timeframe: (message: string) => AiTimeframe;
}

const defaultDeps: OrgChatFactsDeps = {
  query: async (orgId, text, params) => {
    const { tenantQuery } = await import('@/lib/tenancy/db');
    return tenantQuery(orgId, text, params);
  },
  timeframe: (message) => resolveAiTimeframe(message),
};

function sessionStaffId(raw: number | null | undefined): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export function classifyOrgChatQuestion(message: string): OrgChatKind | null {
  const text = message.trim().toLowerCase();
  const mentionsPack = /\b(package|packages|packed|packing|packer)\b/.test(text);
  const asksCount = /\b(how many|count|total|number of)\b/.test(text);
  if (!mentionsPack || !asksCount) return null;
  const thisPacker = /\b(this packer|the packer|i packed|i pack|by me|packed by me)\b/.test(text);
  return thisPacker ? 'session_packer_packages' : 'org_packages';
}

function packCountSql(scopedToPacker: boolean): string {
  const packerPred = scopedToPacker ? '\n          AND pl.packed_by = $2' : '';
  const startIdx = scopedToPacker ? 3 : 2;
  const endIdx = scopedToPacker ? 4 : 3;
  return `
        SELECT COUNT(*)::int AS packed_count
          FROM packer_logs pl
         WHERE pl.organization_id = $1${packerPred}
           AND (timezone('America/Los_Angeles', pl.created_at))::date >= $${startIdx}::date
           AND (timezone('America/Los_Angeles', pl.created_at))::date <= $${endIdx}::date
      `;
}

function formatFacts(lines: string[], operator: string): string {
  return [
    '=== WORKSPACE FACTS (this organization only) ===',
    ...lines,
    'Do not invent extra numbers or name anyone who is not in these facts.',
    '',
    `Operator: ${operator.trim()}`,
  ].join('\n');
}

/**
 * Facts deps with an optional caller-supplied `query` — lets the Ask route run
 * the two facts queries on ONE tenant connection (plan §22 H1) instead of two
 * BEGIN/COMMIT round trips. Omit the argument for the standalone default.
 */
export function orgChatFactsDeps(query?: PlainTenantQuery): OrgChatFactsDeps {
  if (!query) return defaultDeps;
  // The session's query is non-generic (rows are Record<string, unknown>),
  // while this module's callers ask for row shapes at the call site. The rows
  // are the same objects either way — the cast asserts the shape the caller
  // already asserts against its own SELECT list, exactly as tenantQuery does.
  return {
    ...defaultDeps,
    query: ((orgId, text, params) => query(orgId, text, params)) as OrgChatFactsDeps['query'],
  };
}

/** The connection-agnostic query shape a caller can hand in (tenant session). */
export type PlainTenantQuery = (
  orgId: OrgId,
  text: string,
  params?: ReadonlyArray<unknown>,
) => Promise<{ rows: Array<Record<string, unknown>> }>;

export async function fetchOrgChatFacts(
  args: {
    orgId: OrgId;
    staffId: number | null | undefined;
    message: string;
    kind: OrgChatKind;
  },
  deps: OrgChatFactsDeps = defaultDeps,
): Promise<string> {
  const timeframe = deps.timeframe(args.message);
  const windowLine = `Window: ${timeframe.label} (${timeframe.exactLabel})`;
  const operator = args.message.trim();

  if (args.kind === 'org_packages') {
    const counted = await deps.query<{ packed_count: number }>(
      args.orgId,
      packCountSql(false),
      [args.orgId, timeframe.start, timeframe.end],
    );
    const n = Number(counted.rows[0]?.packed_count ?? 0);
    return formatFacts(
      [
        'Question: packages packed in this workspace',
        windowLine,
        `Packages packed: ${Number.isFinite(n) ? n : 0}`,
        'Source: packing scans in this organization.',
      ],
      operator,
    );
  }

  const staffId = sessionStaffId(args.staffId);
  if (staffId == null) {
    return formatFacts(
      [
        'Question: packages packed by the signed-in packer',
        windowLine,
        'No packer is signed in on this session, so there is no packer to count.',
      ],
      operator,
    );
  }

  const staff = await deps.query<{ name: string | null }>(
    args.orgId,
    `
      SELECT s.name
        FROM staff s
       WHERE s.id = $1
         AND s.organization_id = $2
       LIMIT 1
    `,
    [staffId, args.orgId],
  );
  const packerName = String(staff.rows[0]?.name ?? '').trim();
  if (!packerName) {
    return formatFacts(
      [
        'Question: packages packed by the signed-in packer',
        windowLine,
        'No packer is signed in on this session, so there is no packer to count.',
      ],
      operator,
    );
  }

  const counted = await deps.query<{ packed_count: number }>(
    args.orgId,
    packCountSql(true),
    [args.orgId, staffId, timeframe.start, timeframe.end],
  );
  const n = Number(counted.rows[0]?.packed_count ?? 0);
  return formatFacts(
    [
      'Question: packages packed by the signed-in packer',
      `Packer: ${packerName}`,
      windowLine,
      `Packages packed: ${Number.isFinite(n) ? n : 0}`,
      'Source: packing scans by this packer in this organization.',
    ],
    operator,
  );
}
