/**
 * The `/api/receiving-lines/incoming/todo` wire shape + the standalone count
 * hook the Incoming Pipeline Email Triage facet reads.
 *
 * ## Why this is its own module
 *
 * `useIncomingEmailCount` used to live in `EmailTriagePanel.tsx`. Keeping the
 * hook here lets chrome (`IncomingWorkspaceHeader`) poll the count without
 * pulling that whole panel into every receiving surface's initial JS.
 *
 * Keep this module free of component imports, or the fan-in comes straight back.
 */

import { useQuery } from '@tanstack/react-query';

export interface TodoItem {
  id: string;
  order_numbers: string[];
  email_subject: string | null;
  email_from: string | null;
  email_received: string | null;
  scanned_at: string;
  pile: string;
  resolved_at: string | null;
}

export interface TodoResponse {
  success: true;
  open: { items: TodoItem[]; count: number; truncated: boolean };
  done: { items: TodoItem[]; truncated: boolean };
}

/** Shared cache key — the unfiltered (`q=''`) list entry. */
const INCOMING_TODO_QUERY_KEY = ['receiving-lines-incoming-todo', ''] as const;

async function fetchIncomingTodo(): Promise<TodoResponse> {
  const res = await fetch('/api/receiving-lines/incoming/todo', { cache: 'no-store' });
  if (!res.ok) throw new Error('todo fetch failed');
  return res.json();
}

/**
 * Standalone count hook for the Incoming Pipeline Email Triage facet — reuses
 * the same cache entry as the unfiltered list, so it never adds a request.
 */
export function useIncomingEmailCount(): number {
  const { data } = useQuery<TodoResponse>({
    queryKey: INCOMING_TODO_QUERY_KEY,
    queryFn: fetchIncomingTodo,
    refetchInterval: 180_000,
    staleTime: 30_000,
  });
  return data?.open.count ?? 0;
}
