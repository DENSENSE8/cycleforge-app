'use client';

/**
 * Recent AI sessions, always-visible under Pinned (AI-first nav Feature 2).
 *
 * The industry-converged pattern (ChatGPT / Claude / Cursor): a persistent
 * recent list where each row is a destination and a hover `⋮` menu holds the
 * triage verbs — **Rename** (inline), **Pin** (to the shelf, carrying the
 * session id — Feature 3), **Delete** (soft-delete with a real Undo). Titles are the
 * AI summaries `useChatSessions` already returns, so the list reads as work,
 * not "New session · New session".
 *
 * The session you are IN is excluded — the head's current-session row already
 * names it, and duplicating it here would spend two rows on one thread. Capped
 * at {@link MAX_ROWS}; the rest live behind "All sessions" (⌘K / the header
 * switcher), never an unbounded wall down the column.
 */

import { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageSquare, MoreVertical, Pencil, Pin, Trash2 } from '@/components/Icons';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { IconButton } from '@/design-system/primitives/IconButton';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { SPINE_ROW_ICON_CLASS } from '@/components/sidebar/sidebar-spine';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useChatSessions, type ChatSessionRow } from '@/lib/assistant/use-chat-sessions';
import { displaySessionTitle } from '@/lib/ai/session-title-text';
import { useSessionActions } from '@/lib/assistant/use-session-actions';
import { COMMAND_BAR_OPEN_EVENT } from '@/lib/app-events';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

/** Show at most this many; the rest live behind "All sessions" (⌘K). */
const MAX_ROWS = 8;

/**
 * How long the delete toast holds its Undo. The settled range for
 * accidental-click recovery is 5–10s; the repo's other undo rows (manuals
 * library) sit at 10s, so a session — a whole thread of work — gets the same.
 */
const UNDO_WINDOW_MS = 10_000;

function SessionRow({
  session,
  onOpen,
  onRename,
  onDelete,
  onRestore,
  onPin,
}: {
  session: ChatSessionRow;
  onOpen: () => void;
  onRename: (id: string, title: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onRestore: (id: string) => Promise<boolean>;
  onPin: (session: Pick<ChatSessionRow, 'id' | 'title'>) => void;
}) {
  // Never paint a control token at an operator: rows written before the write
  // path stripped Harmony still hold `<|channel|>analysis…`.
  const title = displaySessionTitle(session.title);
  const [editing, setEditing] = useState(false);
  // The draft is RAW operator input, not a display title — what they type is
  // arbitrary text until the rename write sanitizes it.
  const [draft, setDraft] = useState<string>(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startRename = useCallback(() => {
    setDraft(title);
    setEditing(true);
  }, [title]);

  const commit = useCallback(async () => {
    const next = draft.trim();
    setEditing(false);
    if (next && next !== title) await onRename(session.id, next);
  }, [draft, title, onRename, session.id]);

  const cancel = useCallback(() => {
    setEditing(false);
    setDraft(title);
  }, [title]);

  // Effortless Recovery: the delete toast carries the undo, because a session
  // IS the operator's memory of a thread — losing one to a mis-click is a
  // memory-integrity bug. The window is the toast's, and the copy claims
  // nothing longer: no purge cron enforces a retention promise today.
  const remove = useCallback(async () => {
    const ok = await onDelete(session.id);
    if (!ok) return;
    toast.success(`Deleted “${title}”`, {
      duration: UNDO_WINDOW_MS,
      action: {
        label: 'Undo',
        onClick: async () => {
          const restored = await onRestore(session.id);
          if (restored) toast.success(`Restored “${title}”`);
          else toast.error('Could not restore that session');
        },
      },
    });
  }, [onDelete, onRestore, session.id, title]);

  if (editing) {
    return (
      <SidebarMenuItem>
        <input
          ref={inputRef}
          value={draft}
          autoFocus
          aria-label={`Rename ${title}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          className={cn(
            'w-full rounded bg-surface-card px-2 py-1 text-role-nav text-text-default',
            'border border-border-soft outline-none',
            focusRing('control', 'accent'),
          )}
        />
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem className="group/srow relative">
      <SidebarMenuButton
        onClick={onOpen}
        title={title}
        aria-label={`Open ${title}`}
        className="pr-8"
      >
        <MessageSquare className={navIconStrokeClass(SPINE_ROW_ICON_CLASS)} />
        <span className="min-w-0 flex-1 truncate text-left">{title}</span>
      </SidebarMenuButton>
      {/* Hover/focus-revealed ⋮ — the ChatGPT/Claude triage affordance. Kept out
          of the row's click target so opening a thread never opens the menu. */}
      <div
        className={cn(
          'absolute right-1 top-1/2 -translate-y-1/2',
          'opacity-0 transition-opacity',
          'group-hover/srow:opacity-100 group-focus-within/srow:opacity-100',
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              size="sm"
              ariaLabel={`Session actions — ${title}`}
              icon={<MoreVertical className="h-4 w-4" />}
              className="text-text-faint hover:bg-surface-sunken hover:text-text-default"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" sideOffset={2} className="min-w-[11rem]">
            <DropdownMenuItem className="text-role-caption" onSelect={startRename}>
              <Pencil className="h-4 w-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-role-caption"
              onSelect={() => onPin({ id: session.id, title: session.title })}
            >
              <Pin className="h-4 w-4" /> Pin to shelf
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-role-caption" tone="danger" onSelect={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SidebarMenuItem>
  );
}

export function SpineSessionsList({ onOpenSession }: { onOpenSession: (id: string) => void }) {
  const { sessions } = useChatSessions();
  const currentSessionId = useSearchParams().get('session');
  const { renameSession, deleteSession, restoreSession, pinSession } = useSessionActions();

  const { rows, overflow } = useMemo(() => {
    const list = (sessions ?? []).filter((s) => s.id !== currentSessionId);
    return { rows: list.slice(0, MAX_ROWS), overflow: Math.max(0, list.length - MAX_ROWS) };
  }, [sessions, currentSessionId]);

  const openAllSessions = useCallback(() => {
    window.dispatchEvent(new CustomEvent(COMMAND_BAR_OPEN_EVENT));
  }, []);

  // First paint (sessions === null) and a genuinely empty list both render
  // nothing — an empty "Sessions" header is chrome with no map under it.
  if (rows.length === 0) return null;

  return (
    <SidebarGroup role="group" aria-label="Recent sessions">
      <SidebarGroupLabel>Sessions</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {rows.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onOpen={() => onOpenSession(session.id)}
              onRename={renameSession}
              onDelete={deleteSession}
              onRestore={restoreSession}
              onPin={pinSession}
            />
          ))}
          {overflow > 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton
                onClick={openAllSessions}
                aria-label={`All sessions (${overflow} more)`}
                className="text-text-soft"
              >
                <span className="min-w-0 flex-1 truncate text-left text-role-caption">
                  All sessions
                </span>
                <span className="tabular-nums text-role-micro text-text-faint">+{overflow}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
