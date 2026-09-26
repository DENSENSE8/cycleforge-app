import type { AiStructuredAnswer } from '@/lib/ai/types';
import { exportFilename, serializeRows } from '@/lib/tables/export/serialize';

type AssistantArtifactCell = string | number | boolean | null;

interface AssistantTableArtifact {
  id: string;
  title: string;
  columns: string[];
  rows: Array<Record<string, AssistantArtifactCell>>;
  source: 'model-table' | 'structured-answer';
}

export interface ArtifactChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  analysis?: AiStructuredAnswer | null;
}

const INVISIBLE_RE = /[\u202A-\u202E\u2066-\u2069\u200B-\u200F\u2060\uFEFF]/g;

function clean(value: string): string {
  return value.replace(INVISIBLE_RE, '').trim();
}

function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(clean);
}

function isSeparator(line: string): boolean {
  const values = cells(line);
  return values.length > 1 && values.every((value) => /^:?-{3,}:?$/.test(value));
}

/**
 * Extract GFM pipe tables from one settled assistant answer. This is the
 * compatibility door for local models: the model can answer with ordinary
 * markdown while the UI promotes the tabular part into the artifact plane.
 */
export function extractAssistantTables(content: string, messageId = 'answer'): AssistantTableArtifact[] {
  if (!content.includes('|')) return [];

  const lines = content.split(/\r?\n/);
  const artifacts: AssistantTableArtifact[] = [];
  let nearestTitle = '';

  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i] ?? '';
    const separator = lines[i + 1] ?? '';
    if (!/^\s*\|.*\|\s*$/.test(header) || !isSeparator(separator)) {
      const candidate = clean(header).replace(/^#{1,6}\s+/, '');
      // A blank spacer between the introducing sentence and the table is
      // ordinary markdown; it must not erase the title we just found.
      if (candidate) nearestTitle = candidate.length <= 120 ? candidate : '';
      continue;
    }

    const columns = cells(header).slice(0, 12);
    const rows: Array<Record<string, AssistantArtifactCell>> = [];
    let cursor = i + 2;
    while (cursor < lines.length && /^\s*\|.*\|\s*$/.test(lines[cursor] ?? '') && rows.length < 200) {
      const values = cells(lines[cursor] ?? '');
      const row: Record<string, AssistantArtifactCell> = {};
      columns.forEach((column, index) => {
        row[column] = values[index] ?? null;
      });
      rows.push(row);
      cursor += 1;
    }

    if (columns.length > 1) {
      artifacts.push({
        id: `${messageId}:table:${artifacts.length}`,
        title: nearestTitle || 'Data table',
        columns,
        rows,
        source: 'model-table',
      });
    }
    i = cursor - 1;
    nearestTitle = '';
  }

  return artifacts;
}

function structuredArtifacts(message: ArtifactChatMessage): AssistantTableArtifact[] {
  const analysis = message.analysis;
  if (!analysis) return [];

  const artifacts: AssistantTableArtifact[] = [];
  if (analysis.metrics?.length) {
    artifacts.push({
      id: `${message.id}:metrics`,
      title: `${analysis.title} metrics`,
      columns: ['Metric', 'Value', 'Definition'],
      rows: analysis.metrics.map((metric) => ({
        Metric: clean(metric.label),
        Value: clean(metric.value),
        Definition: clean(metric.detail ?? ''),
      })),
      source: 'structured-answer',
    });
  }

  if (analysis.breakdown?.length) {
    artifacts.push({
      id: `${message.id}:breakdown`,
      title: clean(analysis.breakdownTitle ?? analysis.title),
      columns: ['Name', 'Value', 'Details'],
      rows: analysis.breakdown.map((row) => ({
        Name: clean(row.label),
        Value: row.value,
        Details: clean(row.detail ?? ''),
      })),
      source: 'structured-answer',
    });
  }

  if (analysis.sampleRecords?.length) {
    artifacts.push({
      id: `${message.id}:samples`,
      title: clean(analysis.sampleTitle ?? `${analysis.title} records`),
      columns: ['Record', 'Details', 'Path'],
      rows: analysis.sampleRecords.map((row) => ({
        Record: clean(row.primary),
        Details: clean(row.secondary ?? ''),
        Path: clean(row.href ?? ''),
      })),
      source: 'structured-answer',
    });
  }

  return artifacts;
}

/** Newest answer first; every table has a stable id derived from its turn. */
export function assistantArtifacts(messages: readonly ArtifactChatMessage[]): AssistantTableArtifact[] {
  return [...messages]
    .reverse()
    .filter((message) => message.role === 'assistant' && !message.streaming)
    .flatMap((message) => [
      ...extractAssistantTables(message.content, message.id),
      ...structuredArtifacts(message),
    ]);
}

export function assistantArtifactCsv(artifact: AssistantTableArtifact): string {
  return serializeRows(
    artifact.columns,
    artifact.rows.map((row) => artifact.columns.map((column) => row[column] ?? null)),
    'csv',
  );
}

export function assistantArtifactFilename(title: string): string {
  const stem = clean(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'assistant-export';
  return exportFilename(stem, 'csv');
}
