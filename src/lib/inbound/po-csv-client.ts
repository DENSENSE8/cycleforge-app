'use client';

/**
 * Client side of the inbound order import — the ONE fetch + preview hook the
 * desk screen (`/purchasing/import`) and the phone screen
 * (`/m/receiving/import-csv`) use against
 * `POST /api/receiving/inbound/import-po-csv`, plus the recent uploads and
 * the upload check (`/api/receiving/inbound/imports/**`).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePlatformCatalog } from '@/hooks/useCatalog';
import { inboundPlatformOptions } from './inbound-platform-options';
import type { PoField, PoPresetId } from './po-columns';
import type { PoCsvImportResult } from './po-csv-import';
import type { InboundImportBatchSummary, InboundImportCheck } from './import-check';

export type PoCsvImportResponse = PoCsvImportResult & { success: true; dry_run: boolean };

export interface PoCsvImportRequest {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
  preset: PoPresetId;
  /** The operator's platform — only read when the preset stamps none (`generic`). */
  platform?: string;
  mapping?: Partial<Record<PoField, string>> | null;
  assist?: boolean;
  dryRun: boolean;
  label?: string | null;
}

/** Query key of the recent uploads list — invalidate it after a commit. */
export const INBOUND_IMPORT_BATCHES_KEY = ['inbound-import-batches'] as const;

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
  const text = JSON.stringify([input.preset, input.platform, input.mapping, input.headers, input.rows]);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Dry-run preview of the file as mapped now — re-runs whenever rows, preset, mapping or platform change. */
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

async function readJson<T>(url: string, signal: AbortSignal | undefined): Promise<{ status: number; body: (T & { success?: boolean; error?: string }) | null }> {
  const res = await fetch(url, { signal, cache: 'no-store' });
  const body = (await res.json().catch(() => null)) as (T & { success?: boolean; error?: string }) | null;
  if (!res.ok && res.status !== 404) throw new Error(body?.error || `Request failed (${res.status})`);
  return { status: res.status, body };
}

/** Recent uploads, newest first. */
export function useInboundImportBatches() {
  return useQuery({
    queryKey: INBOUND_IMPORT_BATCHES_KEY,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const { body } = await readJson<{ batches: InboundImportBatchSummary[] }>('/api/receiving/inbound/imports', signal);
      return body?.batches ?? [];
    },
  });
}

/** One upload, row by row, file value beside saved value. Null = no such upload. */
export function useInboundImportCheck(batchId: number | null) {
  return useQuery({
    queryKey: ['inbound-import-check', batchId],
    enabled: batchId != null && batchId > 0,
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<InboundImportCheck | null> => {
      const { status, body } = await readJson<{ check: InboundImportCheck }>(`/api/receiving/inbound/imports/${batchId}`, signal);
      return status === 404 ? null : (body?.check ?? null);
    },
  });
}
