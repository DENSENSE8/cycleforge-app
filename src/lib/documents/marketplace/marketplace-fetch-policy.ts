import type { OutboundDocumentType } from '@/lib/documents/types';

/**
 * ECWID invoice-pdf is provider evidence. Replacing a failed provider fetch
 * with a generated slip makes the UI report a document that ECWID never
 * returned, so that path must preserve the typed fetch failure instead.
 */
export function shouldFallbackToGeneratedPackingSlip(
  platform: string,
  type: OutboundDocumentType,
): boolean {
  return type === 'packing_slip' && platform !== 'generated' && platform !== 'ecwid';
}
