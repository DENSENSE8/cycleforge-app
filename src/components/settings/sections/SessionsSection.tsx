'use client';

/**
 * /settings?section=sessions — admin view of active staff sessions with
 * one-click revoke.
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/design-system/primitives';
import { DataTable, type DataTableColumn } from '@/design-system/components/DataTable';

interface SessionRow {
  sid: string;
  staff_id: number;
  staff_name: string;
  device_kind: string;
  device_label: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
}

function fmtRelative(when: string): string {
  const ms = Date.now() - new Date(when).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function SessionsSection() {
  const [rows, setRows] = useState<SessionRow[]>([]);
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
      const data = await r.json() as { sessions: SessionRow[] };
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

  const columns: DataTableColumn<SessionRow>[] = [
    {
      key: 'staff',
      header: 'Staff',
      type: 'text',
      cell: (row) => <span className="font-medium text-text-default">{row.staff_name}</span>,
    },
    {
      key: 'device',
      header: 'Device',
      type: 'tag',
      cell: (row) => (
        <span className="text-xs">
          <span className="mr-2 rounded-full bg-surface-sunken px-2 py-0.5">{row.device_kind}</span>
          {row.device_label && <span className="text-text-soft">{row.device_label}</span>}
        </span>
      ),
    },
    {
      key: 'ip',
      header: 'IP',
      type: 'text',
      cell: (row) => <span className="text-xs text-text-soft">{row.ip || '—'}</span>,
    },
    {
      key: 'last_activity',
      header: 'Last activity',
      type: 'date',
      cell: (row) => <span className="text-xs text-text-soft">{fmtRelative(row.last_seen_at)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={() => void revoke(row.sid)}
          className="border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          Revoke
        </Button>
      ),
    },
  ];

  return (
    <section className="space-y-4">
      <header>
        <h1 className="sr-only">Active sessions</h1>
        <p className="text-sm text-text-soft">Anyone signed in right now. Revoke to kick a device.</p>
      </header>

      {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.sid}
        loading={loading}
        emptyMessage="No active sessions."
      />
    </section>
  );
}
