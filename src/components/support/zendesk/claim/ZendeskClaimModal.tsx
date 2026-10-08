'use client';

import { AlertCircle, Paperclip, Send, TicketHelp, X } from '@/components/Icons';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { Button, IconButton } from '@/design-system/primitives';
import { ClaimComposer } from './ClaimComposer';
import { ClaimModeSwitch } from './ClaimModeSwitch';
import { ClaimSuccessView } from './ClaimSuccessView';
import { ClaimTicketReply } from './ClaimTicketReply';
import { useZendeskClaimController } from './useZendeskClaimController';
import type { ZendeskClaimModalProps } from './claim-types';

/**
 * Reusable Zendesk claim modal: the photos already selected in the library
 * become a new ticket or a reply on an existing one — the library selection is
 * the only way photos are chosen. Both modes share ONE overlay box, so
 * switching Link ↔ New never resizes or moves it; Link is
 * {@link ClaimTicketReply} — the split display the unbox "Link existing
 * ticket" uses, in its compact panel face.
 */
export function ZendeskClaimModal(props: ZendeskClaimModalProps) {
  const c = useZendeskClaimController(props);
  const lockedToTicket = Boolean(props.defaultTicketId);
  const replying = !c.result && c.mode === 'update';

  return (
    <RightPaneOverlay
      open={c.open}
      onClose={c.onClose}
      align="center"
      resizable
      storageKey="zendesk-claim-modal-size"
      minWidth={720}
      minHeight={520}
      className={cn(
        'flex h-[min(88vh,46rem)] w-[min(94vw,56rem)] -mt-6 flex-col overflow-hidden',
        cornerClass('canvas'),
      )}
      aria-label="Create or update a support ticket"
    >
      {replying ? (
        <ClaimTicketReply c={c} />
      ) : (
      <>
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border-hairline px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100">
            <TicketHelp className="h-5 w-5" />
          </span>
          <div>
            <p className="text-role-micro text-rose-500">Support</p>
            <h2 className="text-role-body font-semibold tracking-tight text-text-default">
              {c.result ? 'Done' : 'New support ticket'}
            </h2>
          </div>
        </div>
        <IconButton
          icon={<X className="h-4 w-4" />}
          ariaLabel="Close"
          onClick={c.onClose}
          className="-mr-1 -mt-1 rounded-lg p-1.5 hover:bg-surface-sunken"
        />
      </div>

      {c.result ? (
        <ClaimSuccessView result={c.result} onClose={c.onClose} />
      ) : (
        <>
          {!lockedToTicket ? (
            <div className="shrink-0 border-b border-border-hairline px-5 py-3">
              <ClaimModeSwitch value={c.mode} onChange={c.setMode} />
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <ClaimComposer c={c} />
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-hairline px-5 py-3.5">
            <div className="flex items-center gap-1.5 text-role-caption font-semibold text-text-faint">
              <Paperclip className="h-3.5 w-3.5" />
              {c.totalAttach} photos
            </div>
            <div className="flex items-center gap-2">
              {c.error ? (
                <span className="hidden items-center gap-1 text-role-caption font-semibold text-rose-600 sm:flex">
                  <AlertCircle className="h-3.5 w-3.5" /> {c.error}
                </span>
              ) : null}
              <Button variant="ghost" onClick={c.onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                loading={c.submitting}
                disabled={!c.canSubmit}
                onClick={c.submit}
                icon={<Send className="h-4 w-4" />}
              >
                Create ticket
              </Button>
            </div>
          </div>
        </>
      )}
      </>
      )}
    </RightPaneOverlay>
  );
}
