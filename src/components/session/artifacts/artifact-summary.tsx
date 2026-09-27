import type { ReactNode } from 'react';
import {
  AlertCircle,
  BarChart3,
  ClipboardList,
  ColumnsThree,
  FileText,
  History,
  LayoutDashboard,
  ListChecks,
  Reply,
  Sparkles,
  Ticket,
} from '@/components/Icons';
import type { SessionArtifactEntry } from '../useSessionArtifacts';

export interface ArtifactSummary {
  title: string;
  /** "Table", "Timeline", … */
  kind: string;
  /** "12 rows" — null when the kind has nothing to count. */
  count: string | null;
  icon: ReactNode;
}

const GLYPH = 'h-4 w-4';

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/**
 * The compact face of an artifact — what its transcript card and the side
 * panel header say about it. One switch per `SESSION_ARTIFACT_KINDS` entry
 * (typecheck-enforced exhaustive), so a new kind cannot land without a face.
 */
export function artifactSummary(entry: SessionArtifactEntry): ArtifactSummary {
  const artifact = entry.artifact;
  if (entry.pending) return { title: 'Preparing…', kind: 'Artifact', count: null, icon: <Sparkles className={GLYPH} /> };
  if (!artifact) {
    return {
      title: 'Could not show this result',
      kind: 'Rejected',
      count: null,
      icon: <AlertCircle className={GLYPH} />,
    };
  }
  switch (artifact.kind) {
    case 'table':
      return { title: artifact.title, kind: 'Table', count: plural(artifact.rows.length, 'row'), icon: <ColumnsThree className={GLYPH} /> };
    case 'timeline':
      return { title: artifact.title, kind: 'Timeline', count: plural(artifact.items.length, 'event'), icon: <History className={GLYPH} /> };
    case 'ticket_thread':
      return { title: artifact.title, kind: `Ticket #${artifact.ticketId}`, count: plural(artifact.messages.length, 'message'), icon: <Ticket className={GLYPH} /> };
    case 'ticket_reply_draft':
      return { title: artifact.title, kind: `Reply draft · ticket #${artifact.ticketId}`, count: null, icon: <Reply className={GLYPH} /> };
    case 'chart':
      return { title: artifact.title, kind: 'Chart', count: plural(artifact.series.length, 'point'), icon: <BarChart3 className={GLYPH} /> };
    case 'record':
      return { title: artifact.title, kind: 'Record', count: plural(artifact.fields.length, 'field'), icon: <LayoutDashboard className={GLYPH} /> };
    case 'import_triage':
      return { title: artifact.title, kind: 'Import check', count: plural(artifact.rows.length, 'row'), icon: <ListChecks className={GLYPH} /> };
    case 'document':
      return { title: artifact.title, kind: artifact.source || 'Document', count: null, icon: <FileText className={GLYPH} /> };
    case 'report':
      return {
        title: artifact.title,
        kind: 'Report',
        count: artifact.kpis.length > 0 ? plural(artifact.kpis.length, 'KPI') : plural(artifact.sections.length, 'section'),
        icon: <ClipboardList className={GLYPH} />,
      };
    default:
      return assertNeverArtifactKind(artifact);
  }
}

function assertNeverArtifactKind(artifact: never): never {
  throw new Error(`artifact kind without a summary: ${String((artifact as { kind?: unknown })?.kind)}`);
}
