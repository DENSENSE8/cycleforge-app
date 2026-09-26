'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2, MessageSquare, Ticket, User, Check,
  MoreHorizontal, Pencil, Trash2, X, ExternalLink, Link2,
  Package, Truck, Barcode, Tag, PackageOpen, Wrench, ShieldCheck, Box,
} from '@/components/Icons';
import { Button, IconButton, ConversationMessageCard } from '@/design-system/primitives';
import {
  CONVERSATION_BODY,
  CONVERSATION_MARK,
  CONVERSATION_MARK_BOX,
  CONVERSATION_MARK_NODE,
} from '@/design-system/primitives/conversation-chrome';
import { ThreadNoteComposer } from '@/components/threads/ThreadNoteComposer';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  TrackingChip,
  TicketChip,
  SerialChip,
  OrderIdChip,
  SkuScanRefChip,
  getLast8,
} from '@/components/ui/CopyChip';
import { supportTicketIdFace } from '@/lib/support/ticket-refs';
import { useAuth } from '@/contexts/AuthContext';
import { useThread, type ThreadConnectionRow, type ThreadAssignmentRow } from '@/hooks/useThread';
import type { ThreadMessage, ThreadStatus } from '@/lib/threads/types';
import { seedComposerDraft, type ComposerDraftMode } from '@/lib/threads/composer-draft';
import { requestConfirm } from '@/design-system/components/confirm';
import { StaffAvatar } from '@/components/identity';
import { renderInlineMarkdown } from '@/lib/support/markdown';
import { formatDateTimePST } from '@/utils/date';
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

/** Imperative composer bridge for a host terminal dock (e.g. Unbox Conversation tab). */
export interface ThreadComposerBridge {
  hasDraft: boolean;
  isPublic: boolean;
  submitting: boolean;
  canPost: boolean;
  focus: () => void;
  submit: () => void;
  /** Insert a drafted body into the composer. */
  setDraft: (text: string, opts?: { mode?: ComposerDraftMode }) => void | Promise<unknown>;
}

/** Status → dot + text tones (semantic; never ad-hoc hues). */
const STATUS_TONE: Record<ThreadStatus, { label: string; dot: string; text: string; bg: string; ring: string }> = {
  open:     { label: 'Open',     dot: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-50',    ring: 'ring-blue-200' },
  snoozed:  { label: 'Snoozed',  dot: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-50',   ring: 'ring-amber-200' },
  resolved: { label: 'Resolved', dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-200' },
};

/** Connection entity_type → glyph. Paired with a label, never bare. */
const CONNECTION_ICON: Record<string, typeof Package> = {
  ORDER: Package, TRACKING: Truck, SERIAL_UNIT: Barcode, SKU: Tag,
  RECEIVING: PackageOpen, RECEIVING_LINE: PackageOpen, REPAIR: Wrench,
  WARRANTY_CLAIM: ShieldCheck, FBA_SHIPMENT: Box, SUPPORT_TICKET: Ticket,
};

/** ThreadPanel — the one reusable entity-conversation surface (chat bubbles + composer), ticket-optional, mounted in the idiomatic slot of… */

function MessageBubble({
  m,
  ownStaffId,
  canManage,
  onEdit,
  onDelete,
}: {
  m: ThreadMessage;
  ownStaffId: number | null;
  canManage: boolean;
  onEdit: (messageId: number, body: string) => void;
  onDelete: (messageId: number) => void;
}) {
  const internal = m.visibility === 'internal';
  const ours = m.authorStaffId != null && m.authorStaffId === ownStaffId;
  const name = m.authorName?.trim() || (m.provider === 'system' ? 'System' : 'Staff');
  const pending = m.id < 0; // optimistic row (negative temp id) awaiting server ack
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body);
  const [menuOpen, setMenuOpen] = useState(false);
  const editable = canManage && !pending && m.provider !== 'system';

  if (editing) {
    return (
      <div className="flex items-end gap-2.5">
        <span className="h-7 w-7 shrink-0" />
        <div className="min-w-0 flex-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            autoFocus
            className={cn(
              'block w-full resize-none rounded-xl border border-blue-300 bg-surface-card px-3 py-2 text-role-data text-text-default',
              focusRing('field', 'accent'),
            )}
          />
          <div className="mt-1.5 flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={!draft.trim() || draft.trim() === m.body}
              onClick={() => { onEdit(m.id, draft.trim()); setEditing(false); }}
              icon={<Check className="h-3.5 w-3.5" />}
            >
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { setDraft(m.body); setEditing(false); }}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // The author's REAL avatar — `StaffAvatar` resolves `staff.avatar_photo_id` through the authenticated photo route and falls back to…
  const mark = (
    <div className={CONVERSATION_MARK_BOX}>
      {m.authorStaffId != null ? (
        <StaffAvatar
          staffId={m.authorStaffId}
          name={name}
          size="sm"
          colorRing
          className={CONVERSATION_MARK_NODE}
          alt={name}
        />
      ) : (
        <span
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full text-role-micro',
            CONVERSATION_MARK,
          )}
        >
          {/* System / provider messages have no staffer to resolve. */}
          ·
        </span>
      )}
    </div>
  );

  const metaTrailing = (
    <>
      {m.meta && (m.meta as Record<string, unknown>).editedAt ? (
        <span className="text-text-faint">· edited</span>
      ) : null}
      {editable ? (
        <span className="relative ml-auto opacity-0 transition-opacity group-hover/msg:opacity-100">
          <IconButton
            size="xs"
            ariaLabel="Message actions"
            icon={<MoreHorizontal className="h-3.5 w-3.5" />}
            onClick={() => setMenuOpen((v) => !v)}
          />
          {menuOpen ? (
            <div
              className={cn(
                'absolute right-0 z-panelPopover mt-1 w-32 overflow-hidden border border-border-soft bg-surface-card shadow-lg',
                DROPDOWN_SHELL_CORNER,
              )}
            >
              {/* ds-raw-button: popover menu rows */}
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setDraft(m.body); setEditing(true); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-role-caption text-text-default hover:bg-surface-sunken"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              {/* ds-raw-button: popover menu rows */}
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onDelete(m.id); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-role-caption text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          ) : null}
        </span>
      ) : null}
    </>
  );

  return (
    <div
      className={cn('group/msg', pending && 'opacity-60')}
      onMouseLeave={() => setMenuOpen(false)}
      data-ours={ours ? 'true' : undefined}
    >
      <ConversationMessageCard
        internal={internal}
        mark={mark}
        author={name}
        at={m.createdAt}
        atAbsolute={formatDateTimePST(m.createdAt)}
        metaTrailing={metaTrailing}
      >
        <span className={CONVERSATION_BODY}>{renderInlineMarkdown(m.body)}</span>
      </ConversationMessageCard>
    </div>
  );
}

/** Thread status pill + menu (open / snoozed / resolved). Semantic tones only. */
function StatusControl({
  status,
  canManage,
  onChange,
  pending,
}: {
  status: ThreadStatus;
  canManage: boolean;
  onChange: (s: ThreadStatus) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const tone = STATUS_TONE[status];
  const pill = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-role-eyebrow uppercase tracking-widest ring-1 ring-inset',
        tone.bg, tone.text, tone.ring,
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', tone.dot)} />
      {tone.label}
    </span>
  );
  if (!canManage) return pill;
  return (
    <span className="relative" onMouseLeave={() => setOpen(false)}>
      {/* ds-raw-button: status pill acts as a menu trigger, not a Button action */}
      <button type="button" onClick={() => setOpen((v) => !v)} disabled={pending} className="disabled:opacity-60">
        {pill}
      </button>
      {open ? (
        <div
          className={cn(
            'absolute left-0 z-panelPopover mt-1 w-36 overflow-hidden border border-border-soft bg-surface-card shadow-lg',
            DROPDOWN_SHELL_CORNER,
          )}
        >
          {(Object.keys(STATUS_TONE) as ThreadStatus[]).map((s) => (
            // ds-raw-button: popover menu rows
            <button
              key={s}
              type="button"
              onClick={() => { setOpen(false); if (s !== status) onChange(s); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-role-caption text-text-default hover:bg-surface-sunken"
            >
              <span className={cn('h-2 w-2 rounded-full', STATUS_TONE[s].dot)} />
              {STATUS_TONE[s].label}
              {s === status ? <Check className="ml-auto h-3.5 w-3.5 text-text-faint" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

/** Assignee chip — one owner per thread; opens a staff picker (lazy-loaded). */
function AssigneeControl({
  assignment,
  canManage,
  onAssign,
  onUnassign,
}: {
  assignment: ThreadAssignmentRow | null;
  canManage: boolean;
  onAssign: (staffId: number) => void;
  onUnassign: () => void;
}) {
  const [open, setOpen] = useState(false);
  const staffQuery = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ['thread-assignee-staff'],
    enabled: open,
    staleTime: 300_000,
    queryFn: async () => {
      const res = await fetch('/api/staff');
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    },
  });

  const name = assignment?.assignedStaffName?.trim() || (assignment ? 'Assigned' : null);
  const chip = name ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-strong px-2 py-0.5 text-role-eyebrow uppercase tracking-widest text-text-muted">
      <StaffAvatar
        staffId={assignment?.assignedStaffId ?? null}
        name={name}
        size="xs"
        ring={false}
        alt={name}
      />
      {name}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-role-eyebrow uppercase tracking-widest text-text-faint ring-1 ring-inset ring-border-soft">
      <User className="h-3 w-3" /> Unassigned
    </span>
  );

  if (!canManage) return name ? chip : null;
  return (
    <span className="relative" onMouseLeave={() => setOpen(false)}>
      {/* ds-raw-button: assignee chip acts as a menu trigger */}
      <button type="button" onClick={() => setOpen((v) => !v)}>{chip}</button>
      {open ? (
        <div
          className={cn(
            'absolute left-0 z-panelPopover mt-1 max-h-64 w-52 overflow-y-auto border border-border-soft bg-surface-card shadow-lg',
            DROPDOWN_SHELL_CORNER,
          )}
        >
          {assignment ? (
            // ds-raw-button: popover menu rows
            <button
              type="button"
              onClick={() => { setOpen(false); onUnassign(); }}
              className="flex w-full items-center gap-2 border-b border-border-hairline px-3 py-1.5 text-left text-role-caption text-rose-600 hover:bg-rose-50"
            >
              <X className="h-3.5 w-3.5" /> Unassign
            </button>
          ) : null}
          {staffQuery.isLoading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-role-caption text-text-faint">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            (staffQuery.data ?? []).map((s) => (
              // ds-raw-button: popover menu rows
              <button
                key={s.id}
                type="button"
                onClick={() => { setOpen(false); onAssign(s.id); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-role-caption text-text-default hover:bg-surface-sunken"
              >
                <StaffAvatar staffId={s.id} name={s.name} size="xs" alt={s.name} />
                <span className="truncate">{s.name}</span>
                {assignment?.assignedStaffId === s.id ? <Check className="ml-auto h-3.5 w-3.5 text-text-faint" /> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </span>
  );
}

/** The "connecting dots" strip — derived + curated related entities as chips. */
function ConnectionsStrip({
  connections,
  dense,
  trailing,
}: {
  connections: ThreadConnectionRow[];
  dense: boolean;
  /** Status / assignee / escalate — right-aligned on the same row. */
  trailing?: ReactNode;
}) {
  if (connections.length === 0 && !trailing) return null;
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 overflow-x-auto border-b border-border-hairline pb-2 pt-2',
        dense ? 'px-3' : 'px-5',
      )}
    >
      {connections.length > 0 ? (
        <>
          <HoverTooltip label="Linked" focusable={false}>
            <span className="inline-flex shrink-0 text-text-faint" aria-label="Linked">
              <Link2 className="h-3.5 w-3.5" aria-hidden />
            </span>
          </HoverTooltip>
          {connections.map((c, i) => {
            const key = `${c.entityType}:${c.entityId ?? c.label}:${i}`;
            return <ConnectionChip key={key} connection={c} />;
          })}
        </>
      ) : null}
      {trailing ? <div className="ml-auto flex shrink-0 items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

/** House CopyChip face for linked tracking / ticket / serial / order / sku — last-8. */
function ConnectionChip({ connection: c }: { connection: ThreadConnectionRow }) {
  const type = c.entityType.toUpperCase();
  const hint = (c.hint ?? '').toLowerCase();
  let chip: ReactNode;

  if (type === 'TRACKING' || hint === 'tracking') {
    chip = <TrackingChip value={c.label} dense disableTooltip />;
  } else if (type === 'SUPPORT_TICKET' || type === 'ZENDESK_TICKET' || hint === 'ticket') {
    const face = supportTicketIdFace(c.label);
    chip = <TicketChip value={face.value} display={face.display} dense disableTooltip />;
  } else if (type === 'SERIAL_UNIT' || hint === 'serial') {
    chip = <SerialChip value={c.label} dense disableTooltip />;
  } else if (type === 'ORDER') {
    chip = <OrderIdChip value={c.label} display={getLast8(c.label)} dense />;
  } else if (type === 'SKU' || hint === 'sku') {
    chip = <SkuScanRefChip value={c.label} display={getLast8(c.label)} dense />;
  } else {
    const Icon = CONNECTION_ICON[c.entityType] ?? Tag;
    chip = (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-role-eyebrow uppercase tracking-wide text-text-muted ring-1 ring-inset ring-border-soft">
        <Icon className="h-3 w-3" />
        <span className="max-w-[9rem] truncate normal-case tracking-normal font-mono">
          {getLast8(c.label)}
        </span>
        {c.href ? <ExternalLink className="h-2.5 w-2.5 opacity-60" /> : null}
      </span>
    );
  }

  if (c.href) {
    return (
      <a href={c.href} className="inline-flex shrink-0 items-center gap-0.5">
        {chip}
        {type === 'SUPPORT_TICKET' || type === 'TRACKING' ? (
          <ExternalLink className="h-2.5 w-2.5 shrink-0 text-text-faint" aria-hidden />
        ) : null}
      </a>
    );
  }
  return <span className="inline-flex shrink-0">{chip}</span>;
}

function EscalateOption({
  label,
  hint,
  onClick,
}: {
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    // ds-raw-button: menu row inside a popover, not a standalone Button action
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-surface-sunken"
    >
      <span className="text-role-caption font-semibold text-text-default">{label}</span>
      <span className="text-role-eyebrow text-text-faint">{hint}</span>
    </button>
  );
}

export function ThreadPanel({
  entityType,
  entityId,
  dense = false,
  className,
  /** Hide the inline Add note / Send — the host StationTerminalDock owns submit. */
  externalSubmit = false,
  onBridgeChange,
  onComposerFocusChange,
}: {
  /** Canonical anchor vocab (SURFACE_ENTITY_TYPES key, e.g. 'ORDER'). */
  entityType: string;
  entityId: number | null | undefined;
  /** Tighter paddings for sidebar/tab slots. */
  dense?: boolean;
  className?: string;
  externalSubmit?: boolean;
  onBridgeChange?: (bridge: ThreadComposerBridge | null) => void;
  /**
   * "The operator started writing" — the Search & Details centre collapses its
   * reference blocks on focus so the thread gets the column.
   */
  onComposerFocusChange?: (focused: boolean) => void;
}) {
  const { user, has, isLoaded } = useAuth();
  const canView = isLoaded && has('support.thread.view');
  const canPost = isLoaded && has('support.thread.manage');
  const {
    thread,
    threadLoading,
    threadError,
    messages,
    messagesLoading,
    messagesError,
    postMessage,
    escalate,
    connections,
    assignment,
    setStatus,
    assign,
    unassign,
    editMessage,
    deleteMessage,
  } = useThread(entityType, entityId);
  const [escalateOpen, setEscalateOpen] = useState(false);

  const [body, setBody] = useState('');
  // Default to internal — public mirrors to the linked ticket only once
  // provider mirroring lands; the toggle stays for Zendesk note/reply parity.
  const [isPublic, setIsPublic] = useState(false);

  const endRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const submit = () => {
    const text = body.trim();
    if (!text || postMessage.isPending) return;
    postMessage.mutate(
      { body: text, visibility: isPublic ? 'public' : 'internal' },
      { onSuccess: () => setBody('') },
    );
  };

  useEffect(() => {
    if (!onBridgeChange || !isLoaded) return;
    if (!canView) {
      onBridgeChange(null);
      return;
    }
    onBridgeChange({
      hasDraft: body.trim().length > 0,
      isPublic,
      submitting: postMessage.isPending,
      canPost,
      focus: () => {
        composerRef.current?.focus();
        composerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      },
      submit,
      setDraft: (text, opts) =>
        seedComposerDraft({
          currentBody: body,
          text,
          mode: opts?.mode,
          applyBody: setBody,
          applyMode: setIsPublic,
          confirm: requestConfirm,
          onApplied: () => composerRef.current?.focus(),
        }),
    });
    return () => onBridgeChange(null);
    // submit closes over body/isPublic/postMessage — refresh when those change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    onBridgeChange,
    isLoaded,
    canView,
    canPost,
    body,
    isPublic,
    postMessage.isPending,
  ]);

  if (!isLoaded || !canView) return null;

  const loading = threadLoading || messagesLoading;
  const error = threadError || messagesError;
  const hasTicket =
    Boolean(thread?.supportTicketId) ||
    connections.some((c) => {
      const t = c.entityType.toUpperCase();
      return t === 'SUPPORT_TICKET' || t === 'ZENDESK_TICKET' || c.hint === 'ticket';
    });

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <ConnectionsStrip
        connections={connections}
        dense={dense}
        trailing={
          <>
            {thread ? (
              <StatusControl
                status={thread.status}
                canManage={canPost}
                pending={setStatus.isPending}
                onChange={(s) => setStatus.mutate(s)}
              />
            ) : null}
            <AssigneeControl
              assignment={assignment}
              canManage={canPost}
              onAssign={(id) => assign.mutate(id)}
              onUnassign={() => unassign.mutate()}
            />
            {!hasTicket && canPost ? (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={escalate.isPending}
                  onClick={() => setEscalateOpen((v) => !v)}
                  icon={<Ticket className="h-3.5 w-3.5" />}
                >
                  Escalate
                </Button>
                {escalateOpen && !escalate.isPending ? (
                  <div
                    className={cn(
                      'absolute right-0 z-panelPopover mt-1 w-52 overflow-hidden border border-border-soft bg-surface-card shadow-lg',
                      DROPDOWN_SHELL_CORNER,
                    )}
                  >
                    <EscalateOption
                      label="Internal ticket"
                      hint="Track here — no external send"
                      onClick={() => {
                        setEscalateOpen(false);
                        escalate.mutate('internal');
                      }}
                    />
                    <EscalateOption
                      label="Support ticket"
                      hint="Open a helpdesk ticket"
                      onClick={() => {
                        setEscalateOpen(false);
                        escalate.mutate('zendesk');
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        }
      />

      {escalate.isError ? (
        <div className={cn('pb-2 text-right text-role-caption text-rose-600', dense ? 'px-3' : 'px-5')}>
          {(escalate.error as Error)?.message || 'Couldn’t escalate.'}
        </div>
      ) : null}

      <div className={cn('min-h-0 flex-1 overflow-y-auto', dense ? 'px-3 py-3' : 'px-5 py-4')}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-role-caption text-text-faint">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…
          </div>
        ) : error ? (
          <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center text-role-caption text-rose-600">
            Couldn’t load the conversation.
          </div>
        ) : messages.length === 0 ? (
          // Transparent, not `bg-surface-canvas`:
          <div className="rounded-xl border border-dashed border-border-soft px-4 py-8 text-center">
            <MessageSquare className="mx-auto mb-2 h-5 w-5 text-text-faint" />
            <p className="text-role-caption text-text-faint">
              No messages yet — start the conversation.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                m={m}
                ownStaffId={user?.staffId ?? null}
                canManage={canPost}
                onEdit={(messageId, newBody) => editMessage.mutate({ messageId, body: newBody })}
                onDelete={(messageId) => deleteMessage.mutate(messageId)}
              />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {canPost ? (
        /** The entry band does NOT fork on `dense`, and that is deliberate (2026-08-22). */
        <div className="shrink-0 border-t border-border-hairline bg-surface-card px-3 py-3">
          <ThreadNoteComposer
            value={body}
            onChange={setBody}
            isOnRecord={isPublic}
            onIsOnRecordChange={setIsPublic}
            onSubmit={submit}
            loading={postMessage.isPending}
            disabled={!canPost}
            // One entry face for every host — see the band comment above.
            dense
            externalSubmit={externalSubmit}
            errorMessage={postMessage.isError ? 'Couldn’t send — try again.' : null}
            textareaRef={composerRef}
            onFocus={onComposerFocusChange ? () => onComposerFocusChange(true) : undefined}
            onBlur={onComposerFocusChange ? () => onComposerFocusChange(false) : undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
