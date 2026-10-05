/** Path convention for server-fetched outbound documents (docs/outbound-documents-plan.md §5.2). */

interface OutboundDocumentPathInput {
  orgSlug: string;
  documentType: string;
  platform: string;
  orderRef: string;
  /** Last segment of the tracking number, for a human-scannable filename. */
  trackingTail?: string | null;
  documentId: number;
  extension?: string;
  /** Optional immutable suffix for a replacement generation. */
  versionToken?: string | null;
}

function slugSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'na';
}

/** `{orgSlug}/outbound/{document_type}/{yyyy}/{mm}/{platform}/{orderRef}-{trackingTail}-{docId}.pdf` */
export function buildOutboundDocumentPath(input: OutboundDocumentPathInput, now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = input.extension ?? 'pdf';
  const filename = [
    slugSegment(input.orderRef),
    input.trackingTail ? slugSegment(input.trackingTail) : null,
    String(input.documentId),
    input.versionToken ? slugSegment(input.versionToken) : null,
  ]
    .filter(Boolean)
    .join('-');

  return [
    slugSegment(input.orgSlug),
    'outbound',
    slugSegment(input.documentType),
    String(yyyy),
    mm,
    slugSegment(input.platform),
    `${filename}.${ext}`,
  ].join('/');
}
