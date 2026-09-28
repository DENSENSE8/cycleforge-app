'use client';

/**
 * ArtifactPanel — the AI session's right-hand panel, occupied by the ONE
 * artifact that is open: the newest one a live turn produced, or whichever
 * card the operator clicked. Closed (and absent from the layout) otherwise;
 * × and Esc close it.
 *
 * The registry is the switch below: one branch per artifact kind, all fed by
 * the zod-validated payload from useSessionArtifacts. Nothing here mutates
 * business data — the only actions renderers expose are attaching a row as a
 * composer reference, or the human sending a drafted reply.
 */

import { useRouter } from 'next/navigation';
import { Copy, Download } from '@/components/Icons';
import { AiSidePanel, AiTurnActions, AI_NOTICE_CLASS, useAiActionStates } from '@/design-system/ai';
import { cn } from '@/utils/_cn';
import type { SessionArtifactEntry } from '../useSessionArtifacts';
import { copyArtifact, downloadTableCsv } from './artifact-export';
import { artifactSummary } from './artifact-summary';
import { DocumentArtifact } from './DocumentArtifact';
import { PaymentArtifact } from './PaymentArtifact';
import { OrderDraftArtifact } from './OrderDraftArtifact';
import { PoDraftArtifact } from './PoDraftArtifact';
import { CapabilityArtifact } from './CapabilityArtifact';
import {
  ChartArtifact,
  ImportTriageArtifact,
  RecordArtifact,
  ReportArtifact,
  TableArtifact,
  TicketReplyDraftArtifact,
  TicketThreadArtifact,
  TimelineArtifact,
} from './renderers';

export function ArtifactPanel({
  entry,
  docked,
  onClose,
}: {
  entry: SessionArtifactEntry | null;
  docked: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const summary = entry ? artifactSummary(entry) : null;
  const meta = summary ? [summary.kind, summary.count].filter(Boolean).join(' · ') : null;

  return (
    <AiSidePanel
      open={entry !== null}
      docked={docked}
      onClose={onClose}
      title={summary?.title ?? ''}
      actions={entry?.artifact ? <ArtifactActions artifact={entry.artifact} /> : null}
      meta={meta}
      icon={summary?.icon}
      contentKey={entry?.id ?? 'none'}
      notice={
        entry?.staleAt ? (
          <p className={cn(AI_NOTICE_CLASS, 'mx-3 mt-3 shrink-0 text-ai-label text-text-warning')}>
            From an earlier turn — the latest read failed{entry.staleReason ? `: ${entry.staleReason}` : ''}
          </p>
        ) : null
      }
    >
      {entry?.artifact ? (
        renderArtifact(entry.artifact, (path) => router.push(path), onClose)
      ) : entry ? (
        <p className="px-4 py-3 text-ai-prose-sm text-text-danger">This result could not be shown — its data did not check out.</p>
      ) : null}
    </AiSidePanel>
  );
}

type OpenArtifact = NonNullable<SessionArtifactEntry['artifact']>;

/**
 * Take the open result out of the panel (`artifact-export.ts`, shared with the
 * inline table's controls). Other kinds have no flat shape to hand over yet.
 */
function ArtifactActions({ artifact }: { artifact: OpenArtifact }) {
  const states = useAiActionStates();
  if (artifact.kind !== 'table' && artifact.kind !== 'record') return null;

  const actions = [
    {
      id: 'copy',
      label: 'Copy',
      icon: <Copy className="h-4 w-4" />,
      onClick: () => states.set('copy', copyArtifact(artifact) ? 'done' : 'error'),
      state: states.get('copy'),
    },
  ];
  if (artifact.kind === 'table') {
    actions.push({
      id: 'csv',
      label: 'Download CSV',
      icon: <Download className="h-4 w-4" />,
      onClick: () => states.set('csv', downloadTableCsv(artifact) ? 'done' : 'error'),
      state: states.get('csv'),
    });
  }
  return <AiTurnActions actions={actions} visible ariaLabel="Result actions" className="ml-0" />;
}

function renderArtifact(
  artifact: NonNullable<SessionArtifactEntry['artifact']>,
  navigate: (path: string) => void,
  close: () => void,
) {
  switch (artifact.kind) {
    case 'table':
      return <TableArtifact artifact={artifact} />;
    case 'timeline':
      return <TimelineArtifact artifact={artifact} />;
    case 'ticket_thread':
      return <TicketThreadArtifact artifact={artifact} />;
    case 'ticket_reply_draft':
      return <TicketReplyDraftArtifact artifact={artifact} onSent={close} />;
    case 'chart':
      return <ChartArtifact artifact={artifact} />;
    case 'record':
      return <RecordArtifact artifact={artifact} onOpen={navigate} />;
    case 'import_triage':
      return <ImportTriageArtifact artifact={artifact} />;
    case 'report':
      return <ReportArtifact artifact={artifact} />;
    case 'document':
      return <DocumentArtifact artifact={artifact} />;
    case 'payment':
      return <PaymentArtifact artifact={artifact} />;
    case 'order_draft':
      return <OrderDraftArtifact artifact={artifact} />;
    case 'po_draft':
      return <PoDraftArtifact artifact={artifact} />;
    case 'capability':
      return <CapabilityArtifact artifact={artifact} />;
    default:
      return assertNeverArtifactKind(artifact);
  }
}

/**
 * The switch above is the renderer registry: every `SESSION_ARTIFACT_KINDS`
 * entry must have a branch (typecheck-enforced) and the registry must never
 * silently skip a kind at runtime — a kind without a renderer is a contract
 * break, not a blank panel.
 */
function assertNeverArtifactKind(artifact: never): never {
  throw new Error(`unrenderable artifact kind: ${String((artifact as { kind?: unknown })?.kind)}`);
}
