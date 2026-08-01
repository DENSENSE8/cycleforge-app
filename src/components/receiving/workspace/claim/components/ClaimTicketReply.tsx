import { Image as ImageIcon, Lock, Mail, Send } from '@/components/Icons';
import { Button } from '@/design-system/primitives';
import { PaneHeaderTabs } from '@/components/ui/pane-header';
import { ExpandableComposerField } from '@/components/support/zendesk/chat/ExpandableComposerField';
import { cn } from '@/utils/_cn';
import type { FiledTicket } from '../claim-types';
import type { UseClaimTicketReply } from '../hooks/useClaimTicketReply';
import { CcEmailField } from './CcEmailField';

interface Props {
  reply: UseClaimTicketReply;
  filedTicket: FiledTicket | null;
  /** Requester email shown as To: on public replies. */
  requesterEmail?: string | null;
  /** Optional one-tap prefill (e.g. the drafted seller message). */
  prefill?: string;
  /**
   * Where the primary send CTA lives.
   * - `inline` (default): footer Button — used in modals/popovers
   * - `terminal`: dock SlicedActionDock owns send — Claim tab in TestingPanel
   */
  sendPlacement?: 'inline' | 'terminal';
  /** Opens SendPhotoNoteRail locked to this ticket (Claim tab). */
  onAttachPhotos?: () => void;
}

type ReplyMode = 'internal' | 'public';

/**
 * Reply on the Zendesk ticket — internal note by default, or a public reply that
 * emails the customer. Public mode shows To/Cc; send can live inline or on the
 * station terminal dock.
 */
export function ClaimTicketReply({
  reply,
  filedTicket,
  requesterEmail,
  prefill,
  sendPlacement = 'inline',
  onAttachPhotos,
}: Props) {
  const { body, setBody, isPublic, setIsPublic, ccs, setCcs, sending, send } = reply;

  if (!filedTicket?.id) return null;

  const mode: ReplyMode = isPublic ? 'public' : 'internal';
  const showInlineSend = sendPlacement === 'inline';

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-role-micro uppercase tracking-widest text-text-soft">
          {isPublic ? (
            requesterEmail ? (
              <span className="normal-case tracking-normal">
                <span className="uppercase tracking-widest text-text-faint">To </span>
                <span className="font-semibold text-text-muted">{requesterEmail}</span>
              </span>
            ) : (
              'Public reply'
            )
          ) : (
            'Internal note — not emailed'
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {onAttachPhotos ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onAttachPhotos}
              icon={<ImageIcon className="h-3.5 w-3.5" />}
              className="gap-1.5 px-2 text-role-caption font-semibold"
            >
              Photos
            </Button>
          ) : null}
          <PaneHeaderTabs<ReplyMode>
            tabs={[
              {
                value: 'internal',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Internal
                  </span>
                ),
              },
              {
                value: 'public',
                label: (
                  <span className="inline-flex items-center gap-1">
                    <Mail className="h-3 w-3" /> Public
                  </span>
                ),
              },
            ]}
            value={mode}
            onChange={(next) => setIsPublic(next === 'public')}
            className="rounded-lg border border-border-soft px-1 py-0.5"
          />
        </div>
      </div>

      {isPublic ? (
        <CcEmailField
          emails={ccs}
          onChange={setCcs}
          placeholder="Add vendor / teammate email to CC…"
          disabled={sending}
        />
      ) : null}

      <ExpandableComposerField
        value={body}
        onChange={setBody}
        rows={4}
        disabled={sending}
        expandTitle={isPublic ? 'Compose public reply' : 'Compose internal note'}
        placeholder={
          isPublic
            ? 'Message the customer will receive by email…'
            : 'Internal note — not emailed to anyone…'
        }
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && showInlineSend) void send();
        }}
        className={cn(
          'rounded-lg border bg-surface-card inset-field focus-within:ring-2',
          isPublic
            ? 'border-emerald-200 focus-within:border-emerald-400 focus-within:ring-emerald-500/20'
            : 'border-border-default focus-within:border-border-emphasis focus-within:ring-text-soft/20',
        )}
        textareaClassName="px-3 py-2 text-role-caption font-medium leading-snug"
        expandFooter={
          showInlineSend ? (
            <>
              <p
                className={cn(
                  'text-role-micro font-semibold',
                  isPublic ? 'text-emerald-700' : 'text-text-faint',
                )}
              >
                {isPublic
                  ? `Emails the customer${ccs.length ? ` · ${ccs.length} cc` : ''}.`
                  : 'Private note — no email sent.'}
              </p>
              <Button
                variant="primary"
                size="sm"
                icon={<Send />}
                loading={sending}
                onClick={() => void send()}
                disabled={!body.trim()}
              >
                {isPublic ? 'Send to customer' : 'Add note'}
              </Button>
            </>
          ) : undefined
        }
      />

      {showInlineSend || prefill?.trim() ? (
        <div className="flex items-center justify-between gap-3">
          {showInlineSend ? (
            <p
              className={cn(
                'text-role-micro font-semibold',
                isPublic ? 'text-emerald-700' : 'text-text-faint',
              )}
            >
              {isPublic
                ? `Emails the customer${ccs.length ? ` · ${ccs.length} cc` : ''}.`
                : 'Private note — no email sent.'}
            </p>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {prefill?.trim() ? (
              <Button variant="ghost" size="sm" onClick={() => setBody(prefill)} disabled={sending}>
                Use seller msg
              </Button>
            ) : null}
            {showInlineSend ? (
              <Button
                variant="primary"
                size="sm"
                icon={<Send />}
                loading={sending}
                onClick={() => void send()}
                disabled={!body.trim()}
              >
                {isPublic ? 'Send to customer' : 'Add note'}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
