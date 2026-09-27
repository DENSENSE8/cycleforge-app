'use client';

/**
 * The staffer's recent chat threads, listed directly under the `Chat` row on
 * /ai-chat (Grok pattern). Rows are grouped by local-calendar recency
 * (Today / Yesterday / Previous 7 days / Previous 30 days / Older) and
 * keyset-paged with "Show more".
 *
 * Each row is a real link (`/ai-chat?session=<id>`, so middle-click opens a
 * tab) and carries a hover `⋮` menu: Rename (inline) and Delete (soft, with a
 * 10 s Undo toast). Nav law: icons live at the parent level only, so rows are
 * text. The live thread that is not listed yet (first turn still in flight)
 * shows as an optimistic first row titled from the session header store.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { MoreVertical, Pencil, Trash2 } from '@/components/Icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { IconButton } from '@/design-system/primitives/IconButton';
import { SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem } from '@/components/ui/sidebar';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useSessionHeader } from '@/components/session/session-title-store';
import { useChatSessions, type ChatSessionRow } from '@/lib/assistant/use-chat-sessions';
import { useSessionActions } from '@/lib/assistant/use-session-actions';
import { groupSessionsByRecency } from '@/lib/assistant/session-groups';
import { displaySessionTitle } from '@/lib/ai/session-title-text';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

/** Accidental-delete recovery window; matches the repo's other undo rows. */
const UNDO_WINDOW_MS = 10_000;
const NEW_CONVERSATION = 'New conversation';

/** Let modified clicks (new tab / window) through to the browser; route plain ones. */
function routeClick(e: MouseEvent<HTMLAnchorElement>, href: string, onOpenHref: (href: string) => void) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  onOpenHref(href);
}

function SessionRow({
  session,
  active,
  onOpenHref,
  onRename,
  onDelete,
  onRestore,
}: {
  session: ChatSessionRow;
  active: boolean;
  onOpenHref: (href: string) => void;
  onRename: (id: string, title: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onRestore: (id: string) => Promise<boolean>;
}) {
  const title = displaySessionTitle(session.title, NEW_CONVERSATION);
  const href = `/ai-chat?session=${encodeURIComponent(session.id)}`;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = useCallback(async () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === title) return;
    if (!(await onRename(session.id, next))) toast.error('Could not rename that chat');
  }, [draft, title, onRename, session.id]);

  const remove = useCallback(async () => {
    if (!(await onDelete(session.id))) {
      toast.error('Could not delete that chat');
      return;
    }
    toast.success(`Deleted “${title}”`, {
      duration: UNDO_WINDOW_MS,
      action: {
        label: 'Undo',
        onClick: async () => {
          if (await onRestore(session.id)) toast.success(`Restored “${title}”`);
          else toast.error('Could not restore that chat');
        },
      },
    });
  }, [onDelete, onRestore, session.id, title]);

  if (editing) {
    return (
      <SidebarMenuSubItem>
        <input
          ref={inputRef}
          value={draft}
          autoFocus
          maxLength={200}
          aria-label={`Rename ${title}`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className={cn(
            'h-8 w-full rounded bg-surface-card px-2 text-role-body text-text-default',
            'border border-border-soft outline-none',
            focusRing('control', 'accent'),
          )}
        />
      </SidebarMenuSubItem>
    );
  }

  return (
    <SidebarMenuSubItem className="group/srow">
      <SidebarMenuSubButton
        href={href}
        isActive={active}
        aria-current={active ? 'page' : undefined}
        title={title}
        onClick={(e) => routeClick(e, href, onOpenHref)}
        className="h-8 pr-8"
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </SidebarMenuSubButton>
      {/* Hover/focus-revealed ⋮, outside the link so opening a thread never opens the menu. */}
      <div
        className={cn(
          'absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity',
          'group-hover/srow:opacity-100 group-focus-within/srow:opacity-100 has-[[data-state=open]]:opacity-100',
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              size="xs"
              ariaLabel={`Chat actions — ${title}`}
              icon={<MoreVertical className="h-4 w-4" />}
              className="text-text-faint hover:bg-surface-sunken hover:text-text-default"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom" sideOffset={2} className="min-w-[10rem]">
            <DropdownMenuItem
              className="text-role-caption"
              onSelect={() => {
                setDraft(title);
                setEditing(true);
              }}
            >
              <Pencil className="h-4 w-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-role-caption" tone="danger" onSelect={() => void remove()}>
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </SidebarMenuSubItem>
  );
}

export function ChatSessionsNav({ onOpenHref }: { onOpenHref: (href: string) => void }) {
  const { sessions, nextBefore, loading, reload, loadMore } = useChatSessions();
  const { renameSession, deleteSession, restoreSession } = useSessionActions();
  const header = useSessionHeader();
  const openId = useSearchParams().get('session') ?? header.sessionId;

  const listed = sessions?.some((s) => s.id === header.sessionId) ?? false;
  // The live thread's first turn just landed: pick up its server row, once per thread.
  const reloadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!header.sessionId || !sessions || listed || reloadedFor.current === header.sessionId) return;
    reloadedFor.current = header.sessionId;
    void reload();
  }, [header.sessionId, sessions, listed, reload]);

  const groups = useMemo(() => {
    if (!sessions) return [];
    const rows =
      header.sessionId && !listed
        ? [{ id: header.sessionId, title: header.title, updatedAt: new Date().toISOString(), messageCount: 0 }, ...sessions]
        : sessions;
    return groupSessionsByRecency(rows, new Date());
  }, [sessions, header.sessionId, header.title, listed]);

  if (groups.length === 0) return null;

  return (
    <SidebarMenuSub aria-label="Recent" className="ml-4 pl-1">
      {groups.map((group) => (
        <li key={group.key} role="presentation" className="list-none">
          <div className="px-2 pb-0.5 pt-2 text-role-micro text-text-faint" aria-hidden>
            {group.label}
          </div>
          <ul role="group" aria-label={group.label} className="flex min-w-0 list-none flex-col">
            {group.rows.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                active={session.id === openId}
                onOpenHref={onOpenHref}
                onRename={renameSession}
                onDelete={deleteSession}
                onRestore={restoreSession}
              />
            ))}
          </ul>
        </li>
      ))}
      {nextBefore ? (
        <SidebarMenuSubItem>
          <SidebarMenuSubButton asChild className="h-8 text-text-soft">
            <button type="button" disabled={loading} onClick={() => void loadMore()}>
              <span className="min-w-0 flex-1 truncate text-left text-role-caption">Show more</span>
            </button>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ) : null}
    </SidebarMenuSub>
  );
}
