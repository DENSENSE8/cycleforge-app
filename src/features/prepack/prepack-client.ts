/** Browser reads and writes for the prepack form. Every refusal the server repeats on save is also checked here first. */

import type {
  PrepackCatalogChoice,
  PrepackKit,
  PrepackKitPartInput,
  PrepackManual,
  PrepackManualRemoveInput,
  PrepackSaveInput,
  PrepackSaveResult,
  PrepackUnit,
  PrepackUnitLookup,
} from '@/lib/prepack/types';

/**
 * A failed prepack request. `message` is the operator sentence when the server
 * sent one; a bare code (`INTERNAL`, `FORBIDDEN`…) or a crash never reaches
 * the screen — `prepackErrorText` says what failed in words instead.
 */
export class PrepackRequestError extends Error {
  constructor(message: string, readonly status: number, readonly requestId: string | null) {
    super(message);
  }
}

type ErrorBody = { error?: string; message?: string; permission?: string; hint?: string; requestId?: string };

/** Machine codes the auth wrappers answer with, in operator words. Server failures (`INTERNAL`) have no entry: the caller names what failed. */
const CODE_TEXT: Record<string, (body: ErrorBody) => string> = {
  UNAUTHENTICATED: () => 'You are signed out — sign in again, then retry.',
  FORBIDDEN: (body) => `Your account cannot do this${body.permission ? ` (needs ${body.permission})` : ''} — ask an admin.`,
  STEPUP_REQUIRED: () => 'Confirm with your PIN, then try again.',
  TRIAL_EXPIRED: (body) => body.hint || 'Subscribe under Settings › Billing to continue.',
  FEATURE_GATED: () => 'Your plan does not include this.',
};

export async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & ErrorBody) | null;
  if (response.ok && body) return body;
  const code = body?.error?.trim() ?? '';
  const requestId = body?.requestId ?? response.headers.get('x-request-id');
  const isCode = /^[A-Z][A-Z0-9_]*$/.test(code);
  const text = isCode ? CODE_TEXT[code]?.(body ?? {}) ?? '' : code;
  throw new PrepackRequestError(response.status >= 500 && isCode ? '' : text, response.status, requestId);
}

/** The operator-facing text of a failed read or write: the server's sentence, else what failed and a reference to quote. */
export function prepackErrorText(cause: unknown, fallback: string): string {
  if (cause instanceof PrepackRequestError) {
    if (cause.message) return cause.message;
    const ref = cause.requestId ? ` (ref ${cause.requestId.slice(0, 8)})` : '';
    return `${fallback} — the server hit a problem${ref}. Try again; if it repeats, send the ref to support.`;
  }
  if (cause instanceof TypeError) return `${fallback} — the connection dropped. Check the network and try again.`;
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

const NO_STORE: RequestInit = { credentials: 'include', cache: 'no-store' };

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    ...NO_STORE,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function fetchPrepackKit(skuCatalogId: number): Promise<PrepackKit> {
  return readJson<PrepackKit>(await fetch(`/api/prepack/catalog/${skuCatalogId}`, NO_STORE));
}

export async function fetchPrepackUnit(scan: string): Promise<PrepackUnitLookup> {
  const body = await readJson<PrepackUnitLookup>(
    await fetch(`/api/prepack/unit?scan=${encodeURIComponent(scan)}`, NO_STORE),
  );
  return body.unit ? { unit: body.unit, newSerial: null } : { unit: null, newSerial: body.newSerial };
}

/** Products from printed QC labels, newest print first. */
export async function fetchRecentPrepackProducts(): Promise<PrepackCatalogChoice[]> {
  return (await readJson<{ items: PrepackCatalogChoice[] }>(await fetch('/api/prepack/recent', NO_STORE))).items;
}

/** One transaction for every package; answers one print unit per package, in order. */
export async function savePrepackPackages(input: PrepackSaveInput): Promise<PrepackSaveResult> {
  return readJson<PrepackSaveResult>(await postJson('/api/prepack/package', input));
}

/** Pairing is product data: it saves at once and outlives an abandoned form. */
export async function addPrepackKitPart(skuCatalogId: number, input: PrepackKitPartInput): Promise<PrepackKit> {
  return readJson<PrepackKit>(await postJson(`/api/prepack/catalog/${skuCatalogId}/parts`, input));
}

export async function linkPrepackManual(skuCatalogId: number, manualId: number): Promise<PrepackKit> {
  return readJson<PrepackKit>(await postJson(`/api/prepack/catalog/${skuCatalogId}/manual`, { manualId }));
}

/** Unpair the manual from this product, or retire it from the library; answers the fresh kit. */
export async function removePrepackManual(skuCatalogId: number, input: PrepackManualRemoveInput): Promise<PrepackKit> {
  return readJson<PrepackKit>(
    await fetch(`/api/prepack/catalog/${skuCatalogId}/manual`, {
      ...NO_STORE,
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  );
}

export async function uploadPrepackManual(skuCatalogId: number, file: File): Promise<PrepackKit> {
  const form = new FormData();
  form.append('file', file);
  return readJson<PrepackKit>(
    await fetch(`/api/prepack/catalog/${skuCatalogId}/manual/upload`, { ...NO_STORE, method: 'POST', body: form }),
  );
}

export async function searchPrepackManuals(query: string, signal: AbortSignal): Promise<PrepackManual[]> {
  const response = await fetch(`/api/prepack/manuals?q=${encodeURIComponent(query)}`, { ...NO_STORE, signal });
  return (await readJson<{ items: PrepackManual[] }>(response)).items;
}

/** A unit keeps the catalog identity it was received under; prepack refuses to change it. */
export function prepackCatalogMismatch(unit: PrepackUnit, catalog: PrepackCatalogChoice): string | null {
  const idMismatch = unit.skuCatalogId != null && unit.skuCatalogId !== catalog.id;
  const skuMismatch =
    unit.skuCatalogId == null &&
    Boolean(unit.sku?.trim()) &&
    unit.sku!.trim().toUpperCase() !== catalog.sku.trim().toUpperCase();
  if (!idMismatch && !skuMismatch) return null;
  return `${unit.serialNumber} belongs to ${unit.title || unit.sku || 'a different product'}, not ${catalog.sku} — scan a ${catalog.sku} serial or change the product.`;
}

/** Units prepack never labels, each with its fix in one sentence. */
export function prepackUnitRefusal(unit: PrepackUnit): string | null {
  const key = unit.serialNumber;
  if (unit.currentStatus === 'SHIPPED') return `${key} already shipped — scan a different serial.`;
  if (unit.orderId) return `${key} is on order ${unit.orderLabel || unit.orderId} — release it from that order first, or scan a different serial.`;
  if (unit.currentStatus === 'SCRAPPED') return `${key} is scrapped — scan a different serial.`;
  if (unit.currentStatus === 'ON_HOLD') return `${key} is on hold — release the hold first, or scan a different serial.`;
  if (unit.packageUid) return `${key} is already packed in ${unit.packageUid} — reprint it from QC labels, or dissolve it under Label manifests first.`;
  return null;
}
