'use client';

/**
 * /settings/sessions — admin view of active staff sessions with one-click
 * revoke.
 *
 * Off the second table engine 2026-09-11 (Wave D). The list is the slot
 * `DataTable` (`auth-sessions` PRODUCT_TABLES peer): header sort, the Fields
 * picker and org-bindable columns arrive from the engine, none of which the
 * five hand-written column objects it replaced could ever grow. That history
 * lives in `sessions/auth-sessions-grid-layout.ts`.
 *
 * Revoke is a ROW VERB (`auth-sessions-verbs.ts`) confirmed on a stage-overlay
 * plane — never an actions column, never `window.confirm`.
 */

import { useCallback, useEffect, useState } from 'react';
import { DataTable } from '@/components/tables/DataTable';
import { AuthSessionRevokePlane } from '@/components/settings/sessions/AuthSessionRevokePlane';
import { resolveAuthSessionRowActions } from '@/components/settings/sessions/auth-sessions-verbs';
import { useAuthSessionsSpreadsheet } from '@/components/settings/sessions/useAuthSessionsSpreadsheet';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import type { AuthSessionTableRow } from '@/lib/auth/auth-session-row';

export function SessionsSection() {
  const [rows, setRows] = useState<AuthSessionTableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AuthSessionTableRow | null>(null);
  const [revoking, setRevoking] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/admin/sessions', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) {
        setErr(r.status === 401 || r.status === 403 ? "You don't have access to this." : 'Could not load sessions.');
        return;
      }
      const data = await r.json() as { sessions: AuthSessionTableRow[] };
      setRows(data.sessions || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const confirmRevoke = useCallback(async (row: AuthSessionTableRow) => {
    setRevoking(true);
    setErr(null);
    try {
      const r = await fetch(`/api/admin/sessions/${encodeURIComponent(row.sid)}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (!r.ok) {
        setErr('Could not revoke this session.');
        return;
      }
      setRevokeTarget(null);
      await refresh();
    } finally {
      setRevoking(false);
    }
  }, [refresh]);

  const rowActions = useCallback(
    (row: AuthSessionTableRow): readonly CompoundRowAction[] =>
      resolveAuthSessionRowActions(row, { onRevoke: setRevokeTarget }),
    [],
  );

  const sheet = useAuthSessionsSpreadsheet({ rows, loading, rowActions });

  return (
    <section className="relative flex min-h-0 flex-1 flex-col gap-4">
      <header className="shrink-0">
        <h1 className="sr-only">Active sessions</h1>
        <p className="text-sm text-text-soft">Anyone signed in right now. Revoke to kick a device.</p>
      </header>

      {err && (
        <div className="shrink-0 rounded-lg bg-surface-danger px-3 py-2 text-sm text-text-danger">{err}</div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DataTable {...sheet} totalCount={rows.length} />
      </div>

      <AuthSessionRevokePlane
        row={revokeTarget}
        busy={revoking}
        onClose={() => {
          if (!revoking) setRevokeTarget(null);
        }}
        onConfirm={(row) => void confirmRevoke(row)}
      />
    </section>
  );
}
