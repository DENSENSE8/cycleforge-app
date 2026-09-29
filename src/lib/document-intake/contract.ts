/** Provider-neutral evidence emitted by the shared document-intake OCR lane. */

export interface DocumentOcrPage {
  /** One-based page/image position in the submitted document. */
  page: number;
  text: string;
  /** The current local-vision endpoint does not expose calibrated confidence. */
  confidence: number | null;
}

export interface DocumentOcrArtifact {
  kind: 'document_ocr';
  /** SHA-256 of the exact submitted bytes, including page boundaries. */
  sha256: string;
  fileName: string;
  mimeType: string;
  provider: 'unlimited_ocr';
  pages: DocumentOcrPage[];
  /** Page-labelled plain text for downstream adapters. */
  text: string;
}

export interface DocumentOcrFailure {
  kind: 'document_ocr_failure';
  code: 'not_configured' | 'unsupported_source' | 'unreadable' | 'too_large';
  message: string;
}

export type DocumentOcrEvidence = DocumentOcrArtifact | DocumentOcrFailure;
