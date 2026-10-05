'use client';

/**
 * The live grounded AI draft for a customer conversation: its words, how sure
 * it is, what it cites, what it warns about, the facts it was missing, and
 * the model — or why it failed. A draft that is stale (answered, a newer
 * message, resolved) or already used is not painted: the thread already says
 * what superseded it, so the card offers a fresh draft instead. Use draft
 * lands the text in the composer through the bridge's one overwrite rule
 * (`seedComposerDraft` — never a second seeding path). Nothing here sends.
 */

import { RefreshCw, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/design-system/primitives/Button';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import type { SupportDraftConfidence, SupportDraftView } from '@/lib/support/conversation/model';
import { toast } from '@/lib/toast';
import { SupportChip } from '@/components/ui/SupportChip';
import type { SupportChipTone } from '@/lib/support/record/support-record-model';
import { useSupportItemActions } from '@/lib/support/record/use-support-item';

const CONFIDENCE: Readonly<Record<SupportDraftConfidence, { label: string; tone: SupportChipTone }>> = {
  high: { label: 'High confidence', tone: 'success' },
  medium: { label: 'Medium confidence', tone: 'warning' },
  low: { label: 'Low confidence', tone: 'destructive' },
};

export function SupportDraftCard({
  supportItemId,
  draft,
  bridge,
}: {
  supportItemId: number;
  /** The newest draft (live first, then recent stale / failed); null = none yet. Only a live or failed one is painted. */
  draft: SupportDraftView | null;
  bridge: ThreadComposerBridge | null;
}) {
  const { draftNow } = useSupportItemActions(supportItemId);
  const regenerate = () => draftNow.mutate(undefined, { onError: (err) => toast.error(err.message) });
  const shown = draft && (draft.status === 'pending' || draft.status === 'ready' || draft.status === 'failed') ? draft : null;

  if (!shown) {
    return (
      <section aria-label="AI draft" className="flex items-center gap-2 rounded-2xl border border-border-soft bg-surface-card px-3 py-2" data-testid="support-draft-card" data-draft-status="none">
        <Sparkles aria-hidden className="size-4 text-text-muted" />
        <span className="text-role-caption text-text-muted">No draft yet.</span>
        <Button variant="ghost" size="sm" className="ml-auto" loading={draftNow.isPending} onClick={regenerate} data-testid="support-draft-regenerate">
          Draft with AI
        </Button>
      </section>
    );
  }

  const usable = shown.status === 'ready' && !!shown.body;
  const confidence = shown.confidence ? CONFIDENCE[shown.confidence] : null;

  return (
    <section aria-label="AI draft" className="flex flex-col gap-2 rounded-2xl border border-border-soft bg-surface-card p-3" data-testid="support-draft-card" data-draft-status={shown.status}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Sparkles aria-hidden className="size-4 text-text-info" />
        <span className="text-role-data font-semibold text-text-default">AI draft</span>
        {confidence ? <SupportChip tone={confidence.tone} label={confidence.label} /> : null}
        {shown.status === 'pending' ? <SupportChip tone="default" label="Drafting…" /> : null}
        {shown.status === 'failed' ? <SupportChip tone="destructive" label="Draft failed" /> : null}
        {shown.model ? <span className="ml-auto text-role-caption text-text-muted">{shown.model}</span> : null}
      </div>
      {shown.status === 'failed' && shown.error ? <p className="text-role-caption text-text-danger">{shown.error}</p> : null}
      {shown.body ? <p className="whitespace-pre-wrap break-words text-role-data text-text-default">{shown.body}</p> : null}
      {shown.warnings.length > 0 ? (
        <ul className="flex flex-col gap-0.5" aria-label="Warnings">
          {shown.warnings.map((w) => (
            <li key={w} className="text-role-caption text-text-warning">
              {w}
            </li>
          ))}
        </ul>
      ) : null}
      {shown.missingFacts.length > 0 ? (
        <p className="text-role-caption text-text-muted">
          <span className="font-semibold text-text-default">Missing: </span>
          {shown.missingFacts.join(' · ')}
        </p>
      ) : null}
      {shown.citations.length > 0 ? (
        <div className="flex flex-wrap gap-1" aria-label="Citations">
          {shown.citations.map((c, i) => (
            <Badge key={`${c.type}:${c.ref ?? i}`} variant="outline" title={c.ref ?? undefined}>
              {c.label}
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw aria-hidden />}
          loading={draftNow.isPending}
          onClick={regenerate}
          data-testid="support-draft-regenerate"
        >
          Regenerate
        </Button>
        <Button
          variant="primarySoft"
          size="sm"
          disabled={!usable || !bridge}
          onClick={() => {
            if (shown.body && bridge) void bridge.setDraft(shown.body, { mode: 'public', draftId: shown.id });
          }}
          data-testid="support-draft-use"
        >
          Use draft
        </Button>
      </div>
    </section>
  );
}
