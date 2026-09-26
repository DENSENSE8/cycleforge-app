/** AI-assisted column mapping for order-list import — a thin adapter over the existing engine, NOT a second import path. */

import { hermesToolCall, type HermesTool } from '@/lib/ai/hermes-tool-call';
import {
  CSV_ORDER_CANONICAL_FIELDS,
  type CsvOrderCanonicalKey,
} from '@/lib/orders/csv-order-import';
import type { OrgId } from '@/lib/tenancy/constants';

interface ColumnMappingSuggestion {
  field: CsvOrderCanonicalKey;
  /** A header that EXISTS in the uploaded file (verified before returning). */
  header: string;
  confidence: 'high' | 'medium' | 'low';
  /** Why this column, in the operator's terms — shown next to the checkbox. */
  reason: string;
}

interface ColumnMappingProposal {
  suggestions: ColumnMappingSuggestion[];
  /** Fields still unmapped after the proposal — stated, never implied. */
  stillUnmapped: CsvOrderCanonicalKey[];
  model: string;
  source: string;
  /**
   * Suggestions the model returned that were REJECTED because they named a
   * column not in the file. Surfaced (not swallowed) so a systematically
   * hallucinating model is visible rather than looking like a quiet no-op.
   */
  rejectedHallucinations: string[];
}

const MAPPING_TOOL: HermesTool = {
  name: 'propose_column_mapping',
  description:
    'Map spreadsheet column headers to canonical order fields. Only map a column when its header or sample values clearly indicate the field. Leave a field out entirely rather than guessing.',
  parameters: {
    type: 'object',
    properties: {
      mappings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', description: 'Canonical field key' },
            header: { type: 'string', description: 'EXACT column header from the file' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            reason: { type: 'string', description: 'One short clause, operator-readable' },
          },
          required: ['field', 'header', 'confidence', 'reason'],
        },
      },
    },
    required: ['mappings'],
  },
};

const SYSTEM_PROMPT = [
  'You map spreadsheet columns to canonical order fields for a reseller ops system.',
  '',
  'Rules:',
  '- Only use header names EXACTLY as given. Never invent or reword a column.',
  '- Map a field only when the header or the sample values clearly indicate it.',
  '- Omit a field entirely rather than guessing. A missing mapping is cheap for',
  '  the operator to add; a wrong one silently imports the wrong data.',
  '- One column maps to at most one field.',
].join('\n');

/** Headers already claimed by the deterministic alias map. */
function claimedHeaders(mapping: Record<string, string>): Set<string> {
  return new Set(Object.values(mapping));
}

interface ProposeColumnMappingInput {
  headers: string[];
  /** A few rows of values, to disambiguate headers that names alone cannot. */
  sampleRows: Record<string, string>[];
  /** What `autoMapCsvOrderHeaders` already resolved — these are off-limits. */
  deterministicMapping: Record<string, string>;
}

export async function proposeColumnMapping(
  /** Whose AI provider serves this call — required, never defaulted. */
  orgId: OrgId,
  input: ProposeColumnMappingInput,
  deps: { toolCall?: typeof hermesToolCall } = {},
): Promise<ColumnMappingProposal> {
  const toolCall = deps.toolCall ?? hermesToolCall;

  const unmappedFields = CSV_ORDER_CANONICAL_FIELDS.filter(
    (f) => !input.deterministicMapping[f.key],
  );
  const taken = claimedHeaders(input.deterministicMapping);
  const freeHeaders = input.headers.filter((h) => !taken.has(h));

  // Nothing to ask about — do not spend a model call to be told so.
  if (unmappedFields.length === 0 || freeHeaders.length === 0) {
    return {
      suggestions: [],
      stillUnmapped: unmappedFields.map((f) => f.key),
      model: 'none',
      source: 'none',
      rejectedHallucinations: [],
    };
  }

  const userText = [
    'Canonical fields still needing a column:',
    ...unmappedFields.map((f) => `- ${f.key} (${f.label})${f.required ? ' [REQUIRED]' : ''}`),
    '',
    'Available columns (map only these, verbatim):',
    ...freeHeaders.map((h) => `- ${h}`),
    '',
    'Sample rows:',
    JSON.stringify(input.sampleRows.slice(0, 5), null, 2),
  ].join('\n');

  const { args, model, source } = await toolCall<{
    mappings?: Array<{ field?: string; header?: string; confidence?: string; reason?: string }>;
  }>({
    orgId,
    systemPrompt: SYSTEM_PROMPT,
    userText,
    tool: MAPPING_TOOL,
  });

  const validFields = new Set<string>(unmappedFields.map((f) => f.key));
  const freeSet = new Set(freeHeaders);
  const suggestions: ColumnMappingSuggestion[] = [];
  const rejectedHallucinations: string[] = [];
  const usedHeaders = new Set<string>();

  for (const raw of args?.mappings ?? []) {
    const field = String(raw?.field ?? '').trim();
    const header = String(raw?.header ?? '').trim();
    if (!validFields.has(field)) continue; // unknown or already-mapped field
    if (!freeSet.has(header)) {
      // The model named a column that is not in this file.
      if (header) rejectedHallucinations.push(header);
      continue;
    }
    if (usedHeaders.has(header)) continue; // one column, one field
    if (suggestions.some((s) => s.field === field)) continue; // one field, one column

    usedHeaders.add(header);
    const confidence = raw?.confidence;
    suggestions.push({
      field: field as CsvOrderCanonicalKey,
      header,
      confidence:
        confidence === 'high' || confidence === 'medium' || confidence === 'low'
          ? confidence
          : 'low',
      reason: String(raw?.reason ?? '').trim() || 'Suggested by column name.',
    });
  }

  const proposedFields = new Set(suggestions.map((s) => s.field));
  return {
    suggestions,
    stillUnmapped: unmappedFields.map((f) => f.key).filter((k) => !proposedFields.has(k)),
    model,
    source,
    rejectedHallucinations,
  };
}
