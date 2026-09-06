'use client';

/**
 * SessionPlusMenu — the + menu content for the session composer. Unifies the
 * add-verbs that used to be scattered across surfaces:
 *
 *   • Add file / Add photo — stage a reference into the draft (the agent
 *     reasons about the reference; photo library search finds existing ones).
 *   • # Order number — ping an order: seeds "Look up order #<num>".
 *   • Log details — seeds a "Log: …" entry the agent records.
 *   • @ Assign a task — pick a staff member, write the task, create it through
 *     POST /api/ops-plans/tasks (the same endpoint the Tasks workbench uses),
 *     then show that person's open tasks as an artifact.
 *
 * Every action lands as a DRAFT in the ask field or as an artifact — nothing
 * auto-sends, and the only write is the task creation under the user's session.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  FileText,
  Hash,
  Search,
  User,
} from '@/components/Icons';
import { ComposerPlusMenuRow, ComposerPlusMenuSection } from '@/components/composer/ComposerPlusMenu';
import { requestComposerSeed } from '@/lib/assistant/composer-seed-store';
import { SESSION_ARTIFACT_EVENT } from '@/lib/app-events';

type Sub =
  | null
  | { kind: 'photoSearch' }
  | { kind: 'order' }
  | { kind: 'log' }
  | { kind: 'task' };

interface StaffRow {
  id: number;
  name: string;
  role: string | null;
}

export function SessionPlusMenu({ onClose }: { onClose: () => void }) {
  const [sub, setSub] = useState<Sub>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const photoRef = useRef<HTMLInputElement | null>(null);

  const seed = useCallback((text: string) => {
    onClose();
    requestComposerSeed({ text, autoSend: false });
  }, [onClose]);

  const onPickFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      const names = files.map((f) => f.name).join(', ');
      seed(`I'm attaching ${files.length > 1 ? 'files' : 'a file'}: ${names}. Keep them in mind as context for what I ask next.`);
      e.target.value = '';
    },
    [seed],
  );

  const onPickPhoto = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      const names = files.map((f) => f.name).join(', ');
      seed(`Look at this photo (${names}) — I'll say what I need done with it next.`);
      e.target.value = '';
    },
    [seed],
  );

  const createTask = useCallback(
    async (staffId: number, staffName: string, title: string) => {
      setBusy(true);
      try {
        // The desk-task lane keys tasks to a plan; use the org's first active
        // plan (same fallback the Tasks workbench uses: rows[0]?.planId).
        const plansRes = await fetch('/api/ops-plans');
        const plansData = (await plansRes.json().catch(() => null)) as
          | { plans?: Array<{ id: string }> }
          | Array<{ id: string }>
          | null;
        const plans = Array.isArray(plansData) ? plansData : plansData?.plans;
        const planId = plans?.[0]?.id;
        if (!planId) throw new Error('No active plan to attach the task to.');

        const res = await fetch('/api/ops-plans/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, assigneeStaffId: staffId, planId }),
        });
        if (!res.ok) {
          const detail = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(detail?.error ?? `Task creation failed (${res.status})`);
        }

        // Show the person's open tasks — the board is the receipt.
        const tasksRes = await fetch(
          `/api/ops-plans/tasks?staffId=${staffId}&status=open`,
        );
        const tasksData = (await tasksRes.json().catch(() => null)) as
          | { tasks?: Array<{ id?: string; title?: string; status?: string; planTitle?: string }> }
          | null;
        const tasks = tasksData?.tasks ?? [];
        window.dispatchEvent(
          new CustomEvent(SESSION_ARTIFACT_EVENT, {
            detail: {
              kind: 'table',
              title: `Tasks for ${staffName}`,
              columns: ['Task', 'Status'],
              rows: tasks.slice(0, 50).map((t) => ({
                Task: t.title ?? '',
                Status: t.status ?? 'open',
              })),
              entityHint: 'task',
              idColumn: 'Task',
            },
          }),
        );
        onClose();
      } finally {
        setBusy(false);
      }
    },
    [onClose],
  );

  return (
    <>
      {sub === null ? (
        <>
          <ComposerPlusMenuSection>
            <ComposerPlusMenuRow icon={<FileText className="h-3.5 w-3.5" />} onClick={() => fileRef.current?.click()}>
              Add file
            </ComposerPlusMenuRow>
            <ComposerPlusMenuRow icon={<Camera className="h-3.5 w-3.5" />} onClick={() => photoRef.current?.click()}>
              Add photo
            </ComposerPlusMenuRow>
            <ComposerPlusMenuRow icon={<Search className="h-3.5 w-3.5" />} onClick={() => setSub({ kind: 'photoSearch' })}>
              Search existing photos
            </ComposerPlusMenuRow>
          </ComposerPlusMenuSection>
          <ComposerPlusMenuSection>
            <ComposerPlusMenuRow icon={<Hash className="h-3.5 w-3.5" />} onClick={() => setSub({ kind: 'order' })}>
              # Order number
            </ComposerPlusMenuRow>
            <ComposerPlusMenuRow icon={<FileText className="h-3.5 w-3.5" />} onClick={() => setSub({ kind: 'log' })}>
              Log details
            </ComposerPlusMenuRow>
            <ComposerPlusMenuRow icon={<User className="h-3.5 w-3.5" />} onClick={() => setSub({ kind: 'task' })}>
              @ Assign a task
            </ComposerPlusMenuRow>
          </ComposerPlusMenuSection>
        </>
      ) : null}

      {sub?.kind === 'photoSearch' ? <PhotoSearchSub onPick={seed} onBack={() => setSub(null)} /> : null}
      {sub?.kind === 'order' ? (
        <TextSub
          placeholder="Order number…"
          onSubmit={(v) => seed(`Look up order #${v}`)}
          onBack={() => setSub(null)}
        />
      ) : null}
      {sub?.kind === 'log' ? (
        <TextSub
          placeholder="What happened…"
          multiline
          onSubmit={(v) => seed(`Log this: ${v}`)}
          onBack={() => setSub(null)}
        />
      ) : null}
      {sub?.kind === 'task' ? (
        <TaskSub onCreated={createTask} busy={busy} onBack={() => setSub(null)} />
      ) : null}

      {/* hidden pickers */}
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={onPickFile}
        data-testid="session-add-file-input"
      />
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onPickPhoto}
        data-testid="session-add-photo-input"
      />
    </>
  );
}

function TextSub({
  placeholder,
  onSubmit,
  onBack,
  multiline = false,
}: {
  placeholder: string;
  onSubmit: (value: string) => void;
  onBack: () => void;
  multiline?: boolean;
}) {
  const [value, setValue] = useState('');
  const submit = () => {
    if (!value.trim()) return;
    onSubmit(value.trim());
  };
  return (
    <div className="flex flex-col gap-1.5">
      {multiline ? (
        <textarea
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="min-h-16 w-full rounded-lg bg-surface-sunken px-2.5 py-1.5 text-role-caption text-text-default outline-none placeholder:text-text-faint"
        />
      ) : (
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full rounded-lg bg-surface-sunken px-2.5 py-1.5 text-role-caption text-text-default outline-none placeholder:text-text-faint"
        />
      )}
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="ds-raw-button text-role-micro text-text-faint hover:text-text-default">
          Back
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          className="ds-raw-button rounded-lg bg-blue-600 px-2.5 py-1 text-role-micro font-semibold text-white disabled:opacity-50"
        >
          Insert
        </button>
      </div>
    </div>
  );
}

function PhotoSearchSub({ onPick, onBack }: { onPick: (text: string) => void; onBack: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Array<Record<string, unknown>> | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(null);
      return;
    }
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/photos/library?q=${encodeURIComponent(q.trim())}&limit=6`);
        if (!res.ok) return;
        const data = (await res.json()) as { photos?: Array<Record<string, unknown>> };
        if (alive) setResults(data.photos ?? []);
      } catch {
        if (alive) setResults(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [q]);

  return (
    <div className="flex flex-col gap-1.5">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search existing photos…"
        aria-label="Search existing photos"
        className="w-full rounded-lg bg-surface-sunken px-2.5 py-1.5 text-role-caption text-text-default outline-none placeholder:text-text-faint"
      />
      {results && results.length > 0 ? (
        <ul className="max-h-40 overflow-y-auto">
          {results.map((p, i) => {
            const label =
              typeof p.title === 'string'
                ? p.title
                : typeof p.id !== 'undefined'
                  ? `Photo ${String(p.id)}`
                  : `Result ${i + 1}`;
            const id = typeof p.id !== 'undefined' ? String(p.id) : '';
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onPick(`Look at photo ${id} (${label}).`)}
                  className="block w-full truncate rounded-lg px-2 py-1 text-left text-role-caption text-text-muted hover:bg-surface-sunken"
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      <button type="button" onClick={onBack} className="ds-raw-button self-start text-role-micro text-text-faint hover:text-text-default">
        Back
      </button>
    </div>
  );
}

function TaskSub({
  onCreated,
  busy,
  onBack,
}: {
  onCreated: (staffId: number, staffName: string, title: string) => void;
  busy: boolean;
  onBack: () => void;
}) {
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [staffId, setStaffId] = useState<number | null>(null);
  const [title, setTitle] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/staff');
        if (!res.ok) return;
        const data = (await res.json()) as StaffRow[] | { staff?: StaffRow[] };
        setStaff(Array.isArray(data) ? data : (data.staff ?? []));
      } catch {
        setStaff([]);
      }
    })();
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <select
        aria-label="Assign to staff"
        value={staffId ?? ''}
        onChange={(e) => setStaffId(e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded-lg bg-surface-sunken px-2 py-1.5 text-role-caption text-text-default outline-none"
      >
        <option value="">Assign to…</option>
        {(staff ?? []).map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.role ? ` — ${s.role}` : ''}
          </option>
        ))}
      </select>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task…"
        aria-label="Task"
        className="w-full rounded-lg bg-surface-sunken px-2.5 py-1.5 text-role-caption text-text-default outline-none placeholder:text-text-faint"
      />
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="ds-raw-button text-role-micro text-text-faint hover:text-text-default">
          Back
        </button>
        <button
          type="button"
          disabled={busy || !staffId || !title.trim()}
          onClick={() => {
            const s = (staff ?? []).find((x) => x.id === staffId);
            if (s) onCreated(s.id, s.name, title.trim());
          }}
          className="ds-raw-button rounded-lg bg-blue-600 px-2.5 py-1 text-role-micro font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create task'}
        </button>
      </div>
    </div>
  );
}
