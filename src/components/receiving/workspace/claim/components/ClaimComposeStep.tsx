'use client';

import type { ReceivingClaimController } from '../hooks/useReceivingClaimController';
import { ClaimRecipientsField } from './ClaimRecipientsField';

/**
 * Displays / modal claim compose — recipients only.
 *
 * Subject + body are an AI draft in the Omni Composer Ticket tab (template
 * facts go to Hermes, not into a second textarea). Claim type and Create
 * live in that same inset — Link is not a station mouth mode.
 */
export function ClaimComposeStep({ c }: { c: ReceivingClaimController }) {
  return (
    <div className="space-y-0 pt-2">
      {c.reason.trim() ? (
        <div className="space-y-1 border-b border-border-hairline px-3 pb-3" data-claim-issue>
          <p className="text-role-eyebrow uppercase tracking-[0.14em] text-text-faint">
            Issue
          </p>
          <p className="text-role-caption text-text-default">{c.reason}</p>
        </div>
      ) : null}
      <p
        className="border-b border-border-hairline px-3 py-3 text-role-caption text-text-muted"
        data-testid="claim-compose-composer-cue"
      >
        Draft and create from the Ticket composer. Claim type and the Hermes AI
        draft live there — this column keeps recipients in view.
      </p>
      <ClaimRecipientsField
        notePublic={c.notePublic}
        onNotePublicChange={c.setNotePublic}
        ccEmails={c.ccEmails}
        onCcEmailsChange={c.setCcEmails}
      />
    </div>
  );
}
