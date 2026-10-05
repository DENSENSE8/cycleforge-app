'use client';

import type { OutboundDocument, OutboundDocumentType } from './types';
import type { LabelIngestionDto } from '@/lib/label-ingestions/http-client';

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || fallback);
  return body;
}

export const unlinkedDocumentsKey = (documentType?: OutboundDocumentType) =>
  ['documents', 'unlinked', documentType ?? 'all'] as const;

export async function fetchUnlinkedDocuments(documentType?: OutboundDocumentType): Promise<{
  documents: OutboundDocument[];
  unlinkedIngestions: LabelIngestionDto[];
}> {
  const query = documentType ? `?documentType=${documentType}` : '';
  const response = await fetch(`/api/documents/unlinked${query}`, { credentials: 'same-origin', cache: 'no-store' });
  return readJson(response, 'Could not load unlinked documents.');
}

export async function uploadBulkPaperwork(file: File): Promise<OutboundDocument> {
  const form = new FormData();
  form.set('file', file);
  form.set('documentType', 'packing_slip');
  const response = await fetch('/api/documents/unlinked', { method: 'POST', credentials: 'same-origin', body: form });
  return (await readJson<{ document: OutboundDocument }>(response, 'Could not upload bulk paperwork.')).document;
}

export async function removeUnlinkedDocuments(documentType?: OutboundDocumentType): Promise<{
  deletedDocumentIds: number[];
  deletedIngestionIds: number[];
}> {
  const query = documentType ? `?documentType=${documentType}` : '';
  const response = await fetch(`/api/documents/unlinked${query}`, { method: 'DELETE', credentials: 'same-origin' });
  return readJson(response, 'Could not remove unlinked documents.');
}
