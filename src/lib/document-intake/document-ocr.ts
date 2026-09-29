import 'server-only';

import { createHash } from 'node:crypto';
import type { OrgId } from '@/lib/tenancy/constants';
import type { DocumentOcrArtifact, DocumentOcrFailure, DocumentOcrPage } from './contract';
import {
  readImageWithUnlimitedOcr,
  resolveUnlimitedOcrConfig,
  UNLIMITED_OCR_DISPLAY_NAME,
} from './unlimited-ocr-client';

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
 * adapters. It talks only to the dedicated Unlimited OCR endpoint; raw
 * document bytes never enter the general chat-provider failover chain.
 */
export async function readDocumentWithLocalOcr(
  _orgId: OrgId,
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

  const config = resolveUnlimitedOcrConfig();
  if (!config) {
    throw new DocumentOcrError(
      'not_configured',
      `${UNLIMITED_OCR_DISPLAY_NAME} is not connected. Set UNLIMITED_OCR_BASE_URL on the server.`,
    );
  }

  const pages: DocumentOcrPage[] = [];
  for (const [index, source] of sources.entries()) {
    try {
      const result = await readImageWithUnlimitedOcr(source.bytes, source.mimeType, config);
      pages.push({ page: index + 1, text: result.text, confidence: null });
    } catch (error) {
      throw new DocumentOcrError(
        'unreadable',
        `${UNLIMITED_OCR_DISPLAY_NAME} could not read document page ${index + 1}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
    }
  }

  return {
    kind: 'document_ocr',
    sha256: hashSources(sources),
    fileName: safeFileName(sources[0].fileName, 'document'),
    mimeType: sources.length === 1 ? sources[0].mimeType : 'application/x-cycleforge-document-pages',
    provider: 'unlimited_ocr',
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
