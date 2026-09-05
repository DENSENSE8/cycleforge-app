'use client';

/**
 * /settings?section=sessions — admin view of active staff sessions with
 * one-click revoke.
 */

import { useCallback, useEffect, useState } from 'react';
import { DataTable } from '@/components/tables/DataTable';
import { useAuthSessionsSpreadsheet } from '@/components/settings/sessions/useAuthSessionsSpreadsheet';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { AuthSessionRow } from '@/lib/auth/auth-session-row';

/*
  The local `SessionRow` interface and its hand-written `fmtRelative` helper are
  gone. The shape is `AuthSessionRow` (the family's, shared with the catalog and
  the resolver), and "16m ago" is the engine's `date` face — one implementation
  for every table instead of one per section.
*/

export function SessionsSection() {
  const [rows, setRows] = useState<AuthSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/admin/sessions', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) {
        setErr(r.status === 401 || r.status === 403 ? "You don't have access to this." : 'Could not load sessions.');
        return;
      }
      const data = await r.json() as { sessions: AuthSessionRow[] };
      setRows(data.sessions || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const revoke = useCallback(async (sid: string) => {
    if (!confirm('Revoke this session?')) return;
    await fetch(`/api/admin/sessions/${encodeURIComponent(sid)}`, {
      method: 'DELETE', credentials: 'include',
    });
    await refresh();
  }, [refresh]);

  /*
    The one VERB, resolved per row.

    It used to be a trailing ACTIONS column of buttons — a per-family cell, and
    the reason this section could not mount the shared row. Law §4: a verb is
    declared once by the family and reaches every surface that shows it; the row
    menu is that catalog at n=1.
  */
  const rowActions = useCallback(
    (row: AuthSessionRow): readonly CompoundRowAction[] => [
      {
        key: 'revoke',
        label: 'Revoke session',
        tone: 'danger',
        onSelect: () => void revoke(row.sid),
      },
    ],
    [revoke],
  );

  const sheet = useAuthSessionsSpreadsheet({ rows, loading, rowActions });

  return (
    <section className="space-y-4">
      <header>
        <h1 className="sr-only">Active sessions</h1>
        <p className="text-sm text-text-soft">Anyone signed in right now. Revoke to kick a device.</p>
      </header>

      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <DataTable {...sheet} totalCount={rows.length} />
    </section>
  );
}
