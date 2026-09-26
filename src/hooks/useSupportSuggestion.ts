'use client';

import { useMutation } from '@tanstack/react-query';
import type { SearchHit } from '@/lib/search/search-hit';
import type { PhotoEvidence } from '@/lib/support/photo-evidence';
import type { SuggestionConfidence, SuggestionSource } from '@/lib/support/suggest-reply-core';
import type { SupportVisionLane } from '@/lib/support/vision-lane';

/** The drafted reply plus its provenance. */
export interface SupportSuggestionResult {
  suggestion: string;
  sources: SuggestionSource[];
  confidence: SuggestionConfidence;
  /** Which lane actually ran — whether an image left the tenant's hardware. */
  mode: SupportVisionLane;
  model: string;
  grounded: boolean;
  /** Rows in OUR data the attached images resolved to. */
  searchHits: SearchHit[];
  /** Per-photo image facts (caption, labels, damage, OCR, decoded ids). */
  evidence: PhotoEvidence[];
}

interface SupportSuggestionVars {
  ticketId: number;
  subject?: string;
  /** May be empty when photos carry the question. */
  question: string;
  /** Photo IDs, never URLs — see {@link SupportSuggestionResult}. */
  stagedPhotoIds?: number[];
}

async function fetchSuggestion(vars: SupportSuggestionVars): Promise<SupportSuggestionResult> {
  const res = await fetch('/api/support/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vars),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Suggestion failed (${res.status})`);
  // Older responses predate the widened contract; normalize so the trust
  // surface never has to render `undefined.map`.
  return {
    ...(data as SupportSuggestionResult),
    sources: Array.isArray(data?.sources) ? data.sources : [],
    searchHits: Array.isArray(data?.searchHits) ? data.searchHits : [],
    evidence: Array.isArray(data?.evidence) ? data.evidence : [],
  };
}

/** Mutation that asks for a draft support reply for a ticket. */
export function useSupportSuggestion() {
  return useMutation({ mutationFn: fetchSuggestion });
}
