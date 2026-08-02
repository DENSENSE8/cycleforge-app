import { ExternalLink, FileText } from '@/components/Icons';
import { AnimatedCheck } from '@/components/ui/AnimatedCheck';
import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';
import { ClaimFiledBanner } from './ClaimFiledBanner';
import { ClaimNasBackupCard } from './ClaimNasBackupCard';

type ClaimFiledMode = 'created' | 'linked';

/**
 * Shared success step after a ticket is filed (create) or updated (link).
 * Renders mode-appropriate ticket copy + the shared local-backup card.
 */
export function ClaimFiledStep({
  c,
  mode,
}: {
  c: ReceivingClaimController;
  mode: ClaimFiledMode;
}) {
  if (mode === 'linked') {
    return (
      <div className="divide-y divide-border-hairline [&>section]:py-3 [&>section:first-child]:pt-0">
        {c.filedTicket ? (
          <ClaimFiledBanner
            filedTicket={c.filedTicket}
            mode={c.mode}
            linkCommitted={c.linkCommitStatus === 'committed'}
            unlinking={c.unlinking}
            onUnlink={c.handleBannerUnlink}
          />
        ) : null}

        <ClaimNasBackupCard c={c} canArchive />
      </div>
    );
  }

  const { filedTicket, template } = c;
  const subject = template.subject.trim();

  return (
    <div className="divide-y divide-border-hairline space-y-0 [&>section]:py-3 [&>div]:py-3">
      <section className="space-y-1">
        <div className="flex items-center gap-1.5">
          <AnimatedCheck size={14} />
          <p className="text-role-micro uppercase tracking-[0.14em] text-emerald-800">
            Internal ticket filed
          </p>
        </div>
        <p className="text-role-caption font-semibold text-text-default">{filedTicket?.number ?? '—'}</p>
        {subject ? (
          <p className="flex items-center gap-1.5 truncate text-role-caption font-medium text-text-muted">
            <FileText className="h-3 w-3 shrink-0" />
            <span className="truncate">{subject}</span>
          </p>
        ) : null}
        {filedTicket?.url ? (
          <a
            href={filedTicket.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-role-micro uppercase tracking-wider text-blue-700 hover:text-blue-900"
          >
            Open in Zendesk <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </section>

      <ClaimNasBackupCard c={c} canArchive />
    </div>
  );
}
