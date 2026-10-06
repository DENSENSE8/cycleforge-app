'use client';

/**
 * The app-wide **New ticket** — a helpdesk ticket filed from anywhere, without
 * leaving for the helpdesk. Opened by Add → Support → New ticket (`C` then
 * `T`) through {@link NEW_TICKET_OPEN_EVENT}; one desktop mount beside
 * `ThrowTaskHost`.
 *
 * Left: Subject + Details in the claim-compose faces, `@` mentions staff (Tab
 * fills the name). Right: the ticket exactly as the thread will paint it — the
 * same `SupportTicketDetail` preview Unbox's Ticket task shows while drafting.
 * Create (`⌘↵`) posts `POST /api/support/tickets`; the helpdesk gets `@Name`,
 * each mentioned staffer gets an inbox row, and the right pane flips to the
 * live ticket. Closing keeps an unsent draft; a sent one starts fresh.
 *
 * **Test mode** (header switch, remembered per browser) sends the same request
 * with `test: true`: the server validates, builds the exact helpdesk payload,
 * checks the helpdesk connection and resolves the mentions — then creates
 * nothing and rings nobody. The result paints over the preview; the draft
 * stays editable so switching Test off files it for real.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { SupportTicketDetail } from '@/components/support/zendesk/chat/SupportTicketDetail';
import { StaffMentionChips, StaffMentionListbox, useStaffMentionField } from '@/components/mentions/StaffMentionField';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/design-system/components/Dialog';
import {
  DenseComposeBodyBand,
  DenseComposeBodyTextarea,
  DenseComposeLabel,
  DenseComposeSubjectInput,
} from '@/design-system/components/DenseComposeFields';
import { Button, Switch } from '@/design-system/primitives';
import { useLocalStorage } from '@/hooks';
import { NEW_TICKET_OPEN_EVENT } from '@/lib/app-events';
import { supportHref } from '@/lib/nav/route-tree';
import { encodeNoteMentions } from '@/lib/orders/note-mentions';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';
import { NEW_TICKET_LABEL } from './open-new-ticket';
import type { ZendeskComment, ZendeskTicket } from '@/lib/zendesk';

const SUBJECT_MAX = 300;

interface CreatedTicket {
  supportTicketId: number;
  providerTicketId: number;
}

/** What a live create WOULD have done — the server's test-mode answer. */
interface TestRun {
  helpdesk: string | null;
  wouldSend: { subject: string; body: string };
  wouldMention: Array<{ staffId: number; name: string }>;
}

export function NewTicketHost() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [draftKey, setDraftKey] = useState(0);
  const [created, setCreated] = useState<CreatedTicket | null>(null);
  const [testMode, setTestMode] = useLocalStorage('cf:new-ticket:test-mode', false);
  const createdRef = useRef<CreatedTicket | null>(null);
  const markCreated = useCallback((ticket: CreatedTicket) => {
    createdRef.current = ticket;
    setCreated(ticket);
  }, []);

  useEffect(() => {
    const onOpen = () => {
      // A filed ticket is done — the next open is a blank draft.
      if (createdRef.current) {
        createdRef.current = null;
        setCreated(null);
        setDraftKey((k) => k + 1);
      }
      setOpen(true);
    };
    window.addEventListener(NEW_TICKET_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(NEW_TICKET_OPEN_EVENT, onOpen);
  }, []);

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="flex h-[min(42rem,88vh)] max-w-5xl flex-col gap-0 overflow-hidden p-0"
        data-testid="new-ticket-dialog"
        onEscapeKeyDown={(event) => {
          // An open @ list owns Esc first (the textarea closes it).
          if ((event.target as Element | null)?.closest?.('[aria-expanded="true"]')) event.preventDefault();
        }}
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-border-hairline px-5 py-3 pr-12">
          <DialogTitle className="text-role-body">{NEW_TICKET_LABEL}</DialogTitle>
          <DialogDescription className={testMode ? 'text-role-micro font-semibold text-mode-warn' : 'text-role-micro text-text-muted'}>
            {testMode
              ? 'Test mode — nothing reaches the helpdesk or anyone’s inbox'
              : 'Files it in the helpdesk · mentioned staff get it in their inbox'}
          </DialogDescription>
          <label className="ml-auto flex shrink-0 items-center gap-2 text-role-micro text-text-muted">
            Test mode
            <Switch
              checked={testMode}
              disabled={created != null}
              onCheckedChange={setTestMode}
              checkedClassName="data-[state=checked]:bg-mode-warn"
              data-testid="new-ticket-test-mode"
            />
          </label>
        </header>
        <NewTicketComposer key={draftKey} testMode={testMode} created={created} onCreated={markCreated} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function previewTicket(subject: string, body: string): { ticket: ZendeskTicket; comments: ZendeskComment[] } {
  const now = new Date().toISOString();
  const title = subject.trim() || 'New support ticket';
  const text = body.trim() || 'Details you write on the left land here as the first comment.';
  return {
    ticket: { id: 0, subject: title, description: text, status: 'new', priority: 'normal', created_at: now, updated_at: now },
    comments: [{ id: 1, author_id: 0, author_name: 'You', body: text, public: true, created_at: now }],
  };
}

function NewTicketComposer({
  testMode,
  created,
  onCreated,
  onClose,
}: {
  testMode: boolean;
  created: CreatedTicket | null;
  onCreated: (ticket: CreatedTicket) => void;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testRun, setTestRun] = useState<TestRun | null>(null);
  const bodyRef = useRef('');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // One key per draft: a retried click after a slow helpdesk never files twice.
  const idempotencyKey = useRef(safeRandomUUID());
  const mentions = useStaffMentionField({
    areaRef,
    prefetch: true,
    textRef: bodyRef,
    onText: useCallback((next: string) => {
      bodyRef.current = next;
      setBody(next);
    }, []),
  });
  const preview = useMemo(() => previewTicket(subject, body), [subject, body]);
  const missing = subject.trim() ? null : 'Add a subject';
  // A test answer describes one draft — any edit (or leaving test mode) makes it stale.
  useEffect(() => setTestRun(null), [subject, body, testMode]);

  const submit = useCallback(async () => {
    if (saving || created || missing) return;
    setSaving(true);
    setError(null);
    const note = encodeNoteMentions(bodyRef.current, mentions.pickedRef.current).trim();
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: testMode
          ? { 'Content-Type': 'application/json' }
          : { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey.current },
        body: JSON.stringify({ subject: subject.trim(), ...(note ? { note } : {}), ...(testMode ? { test: true } : {}) }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<TestRun> & {
        success?: boolean;
        error?: string;
        test?: boolean;
        supportTicketId?: number;
        providerTicketId?: number;
        mentionedStaffIds?: number[];
      };
      if (testMode) {
        if (!res.ok || !data.success || !data.test || !data.wouldSend) {
          throw new Error(data.error ?? `Test failed (${res.status})`);
        }
        setTestRun({ helpdesk: data.helpdesk ?? null, wouldSend: data.wouldSend, wouldMention: data.wouldMention ?? [] });
        toast.success(data.helpdesk ? 'Test passed — nothing was created' : 'Test ran — the helpdesk is not connected');
        return;
      }
      if (!res.ok || !data.success || data.supportTicketId == null || data.providerTicketId == null) {
        throw new Error(data.error ?? `Could not create the ticket (${res.status})`);
      }
      const rung = data.mentionedStaffIds?.length ?? 0;
      toast.success(`Ticket #${data.providerTicketId} created${rung > 0 ? ` · ${rung} mentioned` : ''}`);
      onCreated({ supportTicketId: data.supportTicketId, providerTicketId: data.providerTicketId });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not create the ticket';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }, [created, mentions.pickedRef, missing, onCreated, saving, subject, testMode]);

  const onFormKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col gap-4 px-5 py-4" onKeyDown={onFormKeyDown}>
        <div>
          <DenseComposeLabel htmlFor="new-ticket-subject">Subject</DenseComposeLabel>
          <DenseComposeSubjectInput
            id="new-ticket-subject"
            autoFocus
            value={subject}
            maxLength={SUBJECT_MAX}
            disabled={created != null}
            onChange={(event) => setSubject(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
                event.preventDefault();
                areaRef.current?.focus();
              }
            }}
            placeholder="What is this about?"
            data-testid="new-ticket-subject"
          />
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col">
          <DenseComposeLabel htmlFor="new-ticket-body">Details</DenseComposeLabel>
          <DenseComposeBodyBand className="flex min-h-0 flex-1 flex-col">
            <DenseComposeBodyTextarea
              id="new-ticket-body"
              ref={areaRef}
              value={body}
              disabled={created != null}
              onChange={(event) => {
                bodyRef.current = event.target.value;
                setBody(event.target.value);
                mentions.sync(event.target.value, event.target.selectionStart ?? event.target.value.length);
              }}
              onSelect={(event) => mentions.onSelect(event.currentTarget)}
              onBlur={mentions.dismiss}
              onKeyDown={(event) => {
                mentions.onKeyDown(event);
              }}
              {...mentions.ariaProps}
              placeholder="What happened, what's needed — @ to mention staff"
              className="min-h-[8rem] flex-1 resize-none"
              data-testid="new-ticket-body"
            />
          </DenseComposeBodyBand>
          <StaffMentionListbox field={mentions} className="absolute bottom-2 left-2" />
        </div>
        <StaffMentionChips field={mentions} text={body} />
        <footer className="flex shrink-0 items-center gap-3 border-t border-border-hairline pt-3">
          <span className="min-w-0 truncate text-role-micro text-text-muted" role={error ? 'alert' : undefined}>
            {created ? (
              <Link href={supportHref({ item: created.supportTicketId })} onClick={onClose} className="text-text-default underline">
                Open in Support
              </Link>
            ) : (
              (error ?? missing)
            )}
          </span>
          {created ? (
            <Button variant="ghost" size="sm" radius="pill" onClick={onClose} className="ml-auto" data-testid="new-ticket-done">
              Done
            </Button>
          ) : (
            <HoverTooltip label={testMode ? 'Run the test — creates nothing' : 'Create ticket'} shortcut="Cmd + Enter" placement="above" asChild>
              <Button
                variant="primary"
                size="sm"
                radius="pill"
                disabled={missing != null}
                loading={saving}
                onClick={() => void submit()}
                className="ml-auto"
                data-testid="new-ticket-submit"
              >
                {testMode ? 'Create test ticket' : 'Create ticket'}
              </Button>
            </HoverTooltip>
          )}
        </footer>
      </div>
      <div className="hidden min-h-0 flex-col border-l border-border-hairline bg-surface-card lg:flex" data-testid="new-ticket-preview">
        {created ? (
          <SupportTicketDetail ticketId={created.providerTicketId} embedded composerPlacement="inline" />
        ) : (
          <>
            {testMode ? <TestModeBanner run={testRun} /> : null}
            <SupportTicketDetail ticketId={0} embedded composerPlacement="host" hideLinkedContext preview={preview} />
          </>
        )}
      </div>
    </div>
  );
}

/** Over the preview while Test mode is on: what to expect, then what a live create would have done. */
function TestModeBanner({ run }: { run: TestRun | null }) {
  return (
    <section
      aria-label="Test result"
      data-testid="new-ticket-test-result"
      className="shrink-0 border-b border-border-hairline border-l-4 border-l-mode-warn bg-mode-panel px-3 py-2 text-role-micro text-text-default"
    >
      <p className="font-semibold text-mode-warn">{run ? 'Test passed — nothing was created' : 'Test mode'}</p>
      {run ? (
        <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
          <dt className="text-text-muted">Helpdesk</dt>
          <dd data-testid="new-ticket-test-helpdesk">
            {run.helpdesk ? `${run.helpdesk} connected` : 'Not connected — a live create would fail'}
          </dd>
          <dt className="text-text-muted">Would notify</dt>
          <dd data-testid="new-ticket-test-mentions">
            {run.wouldMention.length > 0 ? run.wouldMention.map((m) => m.name).join(', ') : 'Nobody'}
          </dd>
          <dt className="text-text-muted">Would send</dt>
          <dd className="whitespace-pre-wrap break-words">
            <span className="font-semibold">{run.wouldSend.subject}</span>
            {'\n'}
            {run.wouldSend.body}
          </dd>
        </dl>
      ) : (
        <p className="mt-0.5 text-text-muted">Create runs every check against the live app, then stops before the helpdesk.</p>
      )}
    </section>
  );
}
