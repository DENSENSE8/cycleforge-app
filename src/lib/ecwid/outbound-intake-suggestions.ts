import 'server-only';

import { resolveEcwidCreds, type EcwidCredentials } from '@/lib/ecwid/client';
import { mapEcwidOrdersToCanonicalLines } from '@/lib/orders/sources/ecwid-orders';
import { groupCanonicalOrderLines, type CanonicalOrderLine } from '@/lib/orders/canonical-order';
import type { CanonicalOrderIntake } from '@/lib/orders/canonical-order-intake';
import type { OrgId } from '@/lib/tenancy/constants';

const ECWID_BASE_URL = 'https://app.ecwid.com/api/v3';
const DEFAULT_LIMIT = 12;
const MAX_QUERY_LENGTH = 160;
const REQUEST_TIMEOUT_MS = 8_000;
interface OutboundIntakeSuggestion {
  id: string;
  label: string;
  draft: Partial<CanonicalOrderIntake>;
  unavailableReason?: string;
}

interface OutboundIntakeSuggestions {
  connected: boolean;
  suggestions: OutboundIntakeSuggestion[];
}

type Fetcher = typeof fetch;

function boundedQuery(value: string): string {
  return value.trim().slice(0, MAX_QUERY_LENGTH);
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function orderSuggestion(lines: CanonicalOrderLine[]): OutboundIntakeSuggestion {
  const grouped = groupCanonicalOrderLines(lines)[0];
  const first = lines[0];
  const lineSummary = lines
    .map((line) => `${line.productTitle || 'Untitled'}${line.sku ? ` · ${line.sku}` : ''} × ${line.quantity || '1'}`)
    .join('; ');
  const isCollapsed = lines.length > 1;

  return {
    id: grouped.externalOrderId,
    label: `${grouped.externalOrderId} · ${lineSummary}`,
    draft: isCollapsed
      ? {}
      : {
          orderNumber: grouped.externalOrderId,
          platformInferred: null,
          platformChosen: 'ecwid',
          importOrigin: 'synced',
          fulfillmentChannel: null,
          itemNumber: first.itemNumber,
          sku: first.sku,
          quantity: first.quantity || '1',
          productTitle: first.productTitle,
          condition: first.condition,
          trackingNumbers: first.trackings,
          docsNotRequired: false,
          labelMode: 'link',
        },
    ...(isCollapsed
      ? {
          unavailableReason:
            `${lines.length} Ecwid lines are grouped into one order row by the existing order engine. ` +
            'Review and add each item separately; this suggestion will not prefill a lossy draft.',
        }
      : {}),
  };
}

async function ecwidJson(
  creds: EcwidCredentials,
  path: string,
  search: Record<string, string>,
  fetcher: Fetcher,
): Promise<unknown> {
  const url = new URL(`${ECWID_BASE_URL}/${encodeURIComponent(creds.storeId)}${path}`);
  for (const [key, value] of Object.entries(search)) url.searchParams.set(key, value);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      headers: { Authorization: `Bearer ${creds.apiToken}`, Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Ecwid request failed (${response.status})`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function getOutboundIntakeSuggestions(
  orgId: OrgId,
  input: { query: string; kind: 'orders' | 'products'; limit?: number },
  deps: { fetcher?: Fetcher; resolveCredentials?: typeof resolveEcwidCreds } = {},
): Promise<OutboundIntakeSuggestions> {
  const query = boundedQuery(input.query);
  if (query.length < 2) return { connected: false, suggestions: [] };

  const creds = await (deps.resolveCredentials ?? resolveEcwidCreds)(orgId);
  if (!creds) return { connected: false, suggestions: [] };
  const requestedLimit = Number(input.limit ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 50)
    : DEFAULT_LIMIT;
  const fetcher = deps.fetcher ?? fetch;

  if (input.kind === 'products') {
    const body = (await ecwidJson(creds, '/products', { keyword: query, limit: String(limit), enabled: 'true' }, fetcher)) as
      | { items?: unknown[] }
      | unknown[];
    const items = Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : [];
    return {
      connected: true,
      suggestions: items
        .map((raw): OutboundIntakeSuggestion | null => {
          const item = (raw ?? {}) as Record<string, unknown>;
          const id = clean(item.id);
          const name = clean(item.name);
          if (!id || !name) return null;
          const sku = clean(item.sku);
          return {
            id: `product:${id}`,
            label: `${name}${sku ? ` · ${sku}` : ''}`,
            draft: { productTitle: name, sku, itemNumber: id },
          };
        })
        .filter((item): item is OutboundIntakeSuggestion => item !== null),
    };
  }

  const body = (await ecwidJson(creds, '/orders', { keywords: query, limit: String(limit) }, fetcher)) as
    | { items?: unknown[] }
    | unknown[];
  const rawOrders = Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : [];
  const mapped = mapEcwidOrdersToCanonicalLines(rawOrders);
  const byOrder = new Map<string, CanonicalOrderLine[]>();
  for (const line of mapped) byOrder.set(line.externalOrderId, [...(byOrder.get(line.externalOrderId) ?? []), line]);
  return { connected: true, suggestions: [...byOrder.values()].map(orderSuggestion).slice(0, limit) };
}
