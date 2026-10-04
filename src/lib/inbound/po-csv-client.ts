'use client';

/**
 * Client side of the bulk purchase-order CSV import — the ONE fetch +
 * preview hook both the desk staging grid and the phone screen use against
 * `POST /api/receiving/inbound/import-po-csv`.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePlatformCatalog } from '@/hooks/useCatalog';
import { inboundPlatformOptions } from './inbound-platform-options';
import type { PoField } from './po-columns';
import type { PoCsvImportResult } from './po-csv-import';

export type PoCsvImportResponse = PoCsvImportResult & { success: true; dry_run: boolean };

export interface PoCsvImportRequest {
  headers: string[];
  rows: Record<string, string>[];
  platform: string;
  mapping?: Partial<Record<PoField, string>> | null;
  assist?: boolean;
  dryRun: boolean;
  label?: string | null;
}

export async function postPoCsvImport(
  body: PoCsvImportRequest,
): Promise<{ ok: true; result: PoCsvImportResponse } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/receiving/inbound/import-po-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as (PoCsvImportResponse & { error?: string; issues?: Array<{ path: string; message: string }> }) | null;
    if (!res.ok || !json?.success) {
      const issue = json?.issues?.[0];
      return { ok: false, error: json?.error === 'INVALID_BODY' && issue ? `${issue.path}: ${issue.message}` : json?.error || `Import failed (${res.status})` };
    }
    return { ok: true, result: json };
  } catch {
    return { ok: false, error: 'Network error — could not reach the import endpoint.' };
  }
}

/** FNV-1a over the request — a cheap, stable query key for thousands of rows. */
function requestKey(input: Omit<PoCsvImportRequest, 'dryRun'>): string {
  const text = JSON.stringify([input.platform, input.mapping, input.headers, input.rows]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Dry-run preview of the file as mapped now — re-runs whenever rows, mapping or platform change. */
export function usePoCsvPreview(input: Omit<PoCsvImportRequest, 'dryRun' | 'assist'> | null) {
  const key = useMemo(() => (input ? requestKey(input) : null), [input]);
  return useQuery({
    queryKey: ['inbound-po-csv-preview', key],
    enabled: input != null && input.rows.length > 0,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const outcome = await postPoCsvImport({ ...input!, dryRun: true });
      if (!outcome.ok) throw new Error(outcome.error);
      return outcome.result;
    },
  });
}

/** The org platform catalog in inbound-intake order, full names (Goodwill near the top). */
export function usePoPlatformChoices(): Array<{ value: string; label: string }> {
  const catalog = usePlatformCatalog();
  return useMemo(() => inboundPlatformOptions(catalog.options ?? []), [catalog.options]);
}