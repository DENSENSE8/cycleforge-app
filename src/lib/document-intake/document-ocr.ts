import 'server-only';

import { createHash } from 'node:crypto';
import { analyzeWithLocalVision, resolveLocalVisionConfig } from '@/lib/photos/local-vision-client';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getPhotoAnalysisSettings } from '@/lib/tenancy/settings';
import type { OrgId } from '@/lib/tenancy/constants';
import type { DocumentOcrArtifact, DocumentOcrFailure, DocumentOcrPage } from './contract';

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_DOCUMENT_PAGES = 10;

export interface DocumentOcrSource {
  bytes: Buffer;
  fileName: string;
  mimeType: string;
}
export class DocumentOcrError extends Error {
  constructor(
    readonly code: DocumentOcrFailure['code'],
    message: string,
  ) {
    super(message);
    this.name = 'DocumentOcrError';
  }
}

function safeFileName(value: string, fallback: string): string {
  return value.trim().replace(/[/\\\r\n]/g, '_').slice(0, 200) || fallback;
}

/** Decode a camera upload without allowing the server to fetch arbitrary URLs. */
export function documentSourceFromDataUrl(dataUrl: string, page: number): DocumentOcrSource {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  if (!match) {
    throw new DocumentOcrError('unsupported_source', 'Paperwork images must be uploaded from this device.');
  }
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.byteLength === 0) throw new DocumentOcrError('unreadable', `Paperwork page ${page} is empty.`);
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new DocumentOcrError('too_large', `Paperwork page ${page} exceeds 50 MB.`);
  }
  const extension = match[1].split('/')[1]?.replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
  return { bytes, fileName: `paperwork-page-${page}.${extension}`, mimeType: match[1] };
}

function hashSources(sources: readonly DocumentOcrSource[]): string {
  const hash = createHash('sha256');
  for (const source of sources) {
    hash.update(source.mimeType);
    hash.update('\0');
    hash.update(source.fileName);
    hash.update('\0');
    hash.update(source.bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

/**
 * The one OCR entry point for Receiving, Chat, kiosks, and future intake
 * adapters. It talks only to the organization's local vision endpoint; raw
 * document bytes never enter the general chat-provider failover chain.
 */
export async function readDocumentWithLocalOcr(
  orgId: OrgId,
  sources: readonly DocumentOcrSource[],
): Promise<DocumentOcrArtifact> {
  if (sources.length === 0) throw new DocumentOcrError('unreadable', 'No document pages were provided.');
  if (sources.length > MAX_DOCUMENT_PAGES) {
    throw new DocumentOcrError('too_large', `Document intake supports up to ${MAX_DOCUMENT_PAGES} pages at a time.`);
  }
  for (const source of sources) {
    if (source.bytes.byteLength === 0) throw new DocumentOcrError('unreadable', `${source.fileName} is empty.`);
    if (source.bytes.byteLength > MAX_DOCUMENT_BYTES) {
      throw new DocumentOcrError('too_large', `${source.fileName} exceeds 50 MB.`);
    }
  }

  const org = await getOrganization(orgId);
  const settings = org ? getPhotoAnalysisSettings(org.settings) : undefined;
  const config = resolveLocalVisionConfig(settings);
  if (!config) {
    throw new DocumentOcrError('not_configured', 'No local document OCR provider is configured for this workspace.');
  }

  const pages: DocumentOcrPage[] = [];
  for (const [index, source] of sources.entries()) {
    const metadata = await analyzeWithLocalVision(
      source.bytes,
      config,
      safeFileName(source.fileName, `document-${index + 1}`),
    );
    const text = metadata?.ocr_text.join('\n').trim() ?? '';
    if (!text) {
      throw new DocumentOcrError('unreadable', `Local OCR could not read document page ${index + 1}.`);
    }
    pages.push({ page: index + 1, text, confidence: null });
  }

  return {
    kind: 'document_ocr',
    sha256: hashSources(sources),
    fileName: safeFileName(sources[0].fileName, 'document'),
    mimeType: sources.length === 1 ? sources[0].mimeType : 'application/x-cycleforge-document-pages',
    provider: 'local_vision',
    pages,
    text: pages.map((page) => `Page ${page.page}:\n${page.text}`).join('\n\n'),
  };
}

export async function readDataUrlImagesWithLocalOcr(
  orgId: OrgId,
  dataUrls: readonly string[],
): Promise<DocumentOcrArtifact> {
  return readDocumentWithLocalOcr(
    orgId,
    dataUrls.map((dataUrl, index) => documentSourceFromDataUrl(dataUrl, index + 1)),
  );
}

export function documentOcrFailure(error: unknown): DocumentOcrFailure {
  if (error instanceof DocumentOcrError) {
    return { kind: 'document_ocr_failure', code: error.code, message: error.message };
  }
  return {
    kind: 'document_ocr_failure',
    code: 'unreadable',
    message: error instanceof Error ? error.message : 'The document could not be read.',
  };
}
