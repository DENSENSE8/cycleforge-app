'use client';

/**
 * ArtifactViewPanel — the view panel beside the assistant chat (the home
 * surface). Renders the agent's current artifact; the stack below lists what
 * this conversation already put here.
 *
 * The registry is the switch below: one branch per artifact kind, all fed by
 * the zod-validated payload from useSessionArtifacts. A pending slot (the
 * agent OPENED render_artifact, the payload is still streaming) paints as a
 * shape-only skeleton. Nothing here mutates business data — the only action
 * renderers expose is attaching a row as a composer reference, or the human
 * sending a drafted reply.
 */

import { useRouter } from 'next/navigation';
import { LayoutDashboard, Sparkles, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/utils/_cn';
import { useSessionArtifacts } from '../useSessionArtifacts';
import { setSessionPanelOccupant } from '../session-panel-occupant';
import {
  ChartArtifact,
  ImportTriageArtifact,
  RecordArtifact,
  TableArtifact,
  TicketReplyDraftArtifact,
  TicketThreadArtifact,
  TimelineArtifact,
} from './renderers';

export function ArtifactViewPanel({ className }: { className?: string }) {
  const { current, history, select, dismiss, clear } = useSessionArtifacts();
  const router = useRouter();
  const navigate = (path: string) => router.push(path);

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col bg-surface-canvas', className)} aria-label="Data view">
      {current?.pending ? (
        <PendingArtifactSkeleton />
      ) : current ? (
        <>
          <div className="flex shrink-0 items-center justify-between border-b border-border-hairline px-3 py-1.5">
            <p className="truncate text-role-caption font-semibold text-text-default">
              {current.artifact?.title ?? 'Unrenderable artifact'}
            </p>
            <div className="flex items-center gap-1">
              <OpenBoardButton />
              {history.length > 0 ? (
                <Button variant="ghost" size="sm" onClick={clear} ariaLabel="Clear view panel">
                  Clear
                </Button>
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => dismiss(current.id)} ariaLabel="Dismiss artifact">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {current.artifact ? (
            renderArtifact(current.artifact, navigate, () => dismiss(current.id))
          ) : (
            <div className="px-4 py-3 text-role-caption text-rose-700">
              The agent sent an artifact the panel could not validate
              {current.rejected ? `: ${current.rejected}` : '.'}
            </div>
          )}
        </>
      ) : (
        <EmptyArtifactState />
      )}

      {history.length > 0 ? (
        <div className="shrink-0 border-t border-border-hairline">
          <p className="px-3 pt-1.5 text-role-eyebrow uppercase tracking-widest text-text-faint">Earlier in this session</p>
          <ul className="max-h-32 overflow-y-auto px-3 py-1">
            {history.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between py-0.5">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-role-caption text-text-muted hover:text-text-default"
                  onClick={() => select(entry.id)}
                >
                  {entry.artifact?.title ?? 'invalid artifact'}
                </button>
                <button
                  type="button"
                  aria-label={`Dismiss ${entry.artifact?.title ?? 'artifact'}`}
                  className="p-1 text-text-faint hover:text-text-default"
                  onClick={() => dismiss(entry.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function renderArtifact(
  artifact: NonNullable<ReturnType<typeof useSessionArtifacts>['current']>['artifact'],
  navigate: (path: string) => void,
  dismiss: () => void,
) {
  if (!artifact) return null;
  switch (artifact.kind) {
    case 'table':
      return <TableArtifact artifact={artifact} />;
    case 'timeline':
      return <TimelineArtifact artifact={artifact} />;
    case 'ticket_thread':
      return <TicketThreadArtifact artifact={artifact} />;
    case 'ticket_reply_draft':
      return <TicketReplyDraftArtifact artifact={artifact} onSent={dismiss} />;
    case 'chart':
      return <ChartArtifact artifact={artifact} />;
    case 'record':
      return <RecordArtifact artifact={artifact} onOpen={navigate} />;
    case 'import_triage':
      return <ImportTriageArtifact artifact={artifact} />;
  }
}

/**
 * The agent opened a `render_artifact` block and its payload is still on the
 * wire. Shape-only stand-in so the panel is occupied from the announcement
 * rather than from the end of the message — house Skeleton (opacity pulse,
 * no geometry, no spinner), never a bespoke loader.
 */
function PendingArtifactSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-artifact-pending aria-busy="true">
      <div className="flex shrink-0 items-center border-b border-border-hairline px-4 py-2">
        <Skeleton className="h-3.5 w-40 rounded" />
      </div>
      <div className="flex flex-col gap-2.5 px-4 py-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className={cn('h-3 rounded', i === 5 ? 'w-2/3' : 'w-full')} />
        ))}
      </div>
    </div>
  );
}

function EmptyArtifactState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center" data-artifact-empty>
      <Sparkles className="h-5 w-5 text-text-faint" />
      <p className="text-role-caption font-medium text-text-muted">Ask, and what you need shows up here.</p>
      <p className="max-w-xs text-role-caption text-text-faint">
        Tables, timelines, tickets, charts — the assistant lays the answer out on this panel instead of reciting rows.
      </p>
      {/*
        The board's front door. It lives in the EMPTY state because that is the
        pane's dead space: before the first answer there is nothing to read
        here, and the numbers an operator opens the app for are one click away.
        The same verb is on the chrome row above once an artifact is mounted,
        and on ⌘B from anywhere.
      */}
      <div className="pt-1">
        <Button variant="secondary" onClick={() => setSessionPanelOccupant('board')}>
          <LayoutDashboard className="h-3.5 w-3.5" aria-hidden /> Open home board
        </Button>
      </div>
      <p className="text-role-micro text-text-faint">⌘B</p>
    </div>
  );
}

/** The chrome-row twin — reachable while an artifact owns the pane. */
function OpenBoardButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setSessionPanelOccupant('board')}
      ariaLabel="Open home board"
    >
      <LayoutDashboard className="h-4 w-4" />
    </Button>
  );
}
