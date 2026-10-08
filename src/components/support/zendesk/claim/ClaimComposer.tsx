'use client';

import { AtSign } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { VisibilityToggle } from '@/components/ui/VisibilityToggle';
import { ZendeskSelect } from '../ZendeskSelect';
import { TagInput } from '../TagInput';
import { ClaimAttachments } from './ClaimAttachments';
import { PRIORITY_OPTIONS } from './claim-types';
import type { ZendeskClaimController } from './useZendeskClaimController';
import { focusRing } from '@/design-system/tokens/focus-ring';


const labelCls = 'text-role-micro text-text-soft';
const inputCls =
  cn('w-full rounded-xl border border-border-default bg-surface-card px-3 py-2.5 text-role-data text-text-default transition placeholder:text-text-faint', focusRing('field', 'accent'));

/** The New ticket form body + the shared attachments section. Link is {@link ClaimTicketReply}. */
export function ClaimComposer({ c }: { c: ZendeskClaimController }) {
  return (
    <div className="space-y-5">
          <div className="space-y-1.5">
            <label className={labelCls}>Subject</label>
            <input
              value={c.subject}
              onChange={(e) => c.setSubject(e.target.value)}
              placeholder="Short summary of the issue"
              className={inputCls}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelCls}>Description</label>
            <textarea
              value={c.description}
              onChange={(e) => c.setDescription(e.target.value)}
              rows={4}
              placeholder="What happened? Include any context the agent needs."
              className={cn(inputCls, 'resize-none leading-relaxed')}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)]">
            <div className="space-y-1.5">
              <label className={labelCls}>Priority</label>
              <ZendeskSelect
                value={c.priority}
                options={PRIORITY_OPTIONS}
                onChange={(v) => c.setPriority(v as typeof c.priority)}
                size="field"
                className="w-full"
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}>Tags</label>
              <TagInput tags={c.tags} onChange={c.setTags} placeholder="Add tags…" />
            </div>
          </div>

          <div className="space-y-2.5 rounded-xl bg-surface-canvas/80 p-3.5 ring-1 ring-inset ring-border-hairline">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-role-caption font-semibold text-text-muted">First message</p>
                <p className="text-role-caption text-text-soft">
                  {c.createPublic ? 'Emails the requester below.' : 'Internal note — nobody is emailed.'}
                </p>
              </div>
              <VisibilityToggle
                value={c.createPublic}
                onChange={c.setCreatePublic}
                internalLabel="Internal"
                publicLabel="Email"
              />
            </div>
            {c.createPublic ? (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <input
                  value={c.requesterName}
                  onChange={(e) => c.setRequesterName(e.target.value)}
                  placeholder="Requester name"
                  className={inputCls}
                />
                <div className="relative">
                  <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" />
                  <input
                    value={c.requesterEmail}
                    onChange={(e) => c.setRequesterEmail(e.target.value)}
                    placeholder="requester@email.com"
                    className={cn(inputCls, 'pl-9')}
                  />
                </div>
              </div>
            ) : null}
          </div>

      <ClaimAttachments c={c} />
    </div>
  );
}
