'use client';

/**
 * Session start / wrap-up composer — NOT the Omni-Command field.
 *
 * ⌘N parks the current block and opens this. Confirm writes a work_sessions
 * row immediately (empty of ops_events is legal). Wrap-up is the end recap
 * (from → to, why), never a second clock.
 */

import { useEffect, useMemo, useState } from 'react';
import type { WorkSessionPurpose } from '@/lib/sessions/types';

export interface SessionComposerStart {
  mode: 'start';
  purposes: readonly WorkSessionPurpose[];
  onCancel: () => void;
  onConfirm: (input: {
    title: string;
    purposeId?: number;
    purposeLabel?: string;
    notes: string;
  }) => void;
  busy?: boolean;
}

export interface SessionComposerEnd {
  mode: 'end';
  title: string;
  onCancel: () => void;
  onConfirm: (input: { wrapUp: string }) => void;
  busy?: boolean;
}

export type SessionComposerProps = SessionComposerStart | SessionComposerEnd;

export function SessionComposer(props: SessionComposerProps) {
  if (props.mode === 'end') return <EndForm {...props} />;
  return <StartForm {...props} />;
}

function StartForm({ purposes, onCancel, onConfirm, busy }: SessionComposerStart) {
  const [purposeQuery, setPurposeQuery] = useState('');
  const [purposeId, setPurposeId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');

  const selected = purposes.find((p) => p.id === purposeId) ?? null;
  const matches = useMemo(() => {
    const q = purposeQuery.trim().toLowerCase();
    if (!q) return purposes;
    return purposes.filter(
      (p) => p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q),
    );
  }, [purposeQuery, purposes]);

  useEffect(() => {
    if (selected && !title) setTitle(selected.label);
  }, [selected, title]);

  const submit = () => {
    const t = title.trim();
    const q = purposeQuery.trim();
    if (purposeId != null) {
      onConfirm({ title: t || selected?.label || q, purposeId, notes: notes.trim() });
      return;
    }
    if (!t && !q) return;
    // One string → title AND a new/reused purpose label.
    if (t && !q) onConfirm({ title: t, purposeLabel: t, notes: notes.trim() });
    else if (!t && q) onConfirm({ title: q, purposeLabel: q, notes: notes.trim() });
    else onConfirm({ title: t, purposeLabel: q, notes: notes.trim() });
  };

  return (
    <div className="session-composer" role="dialog" aria-label="Start a session">
      <div className="session-composer-head">New session</div>
      <p className="session-composer-hint">
        Purpose is the bucket (Front desk, Staff assist). Title is this block — the
        customer, the item, what you are doing.
      </p>
      <label className="session-composer-field">
        <span>Purpose</span>
        <input
          value={selected ? selected.label : purposeQuery}
          onChange={(e) => {
            setPurposeId(null);
            setPurposeQuery(e.target.value);
          }}
          placeholder="Unbox, Front desk, Staff assist, Product triage…"
          autoFocus
        />
      </label>
      {purposeId == null ? (
        <ul className="session-composer-list">
          {matches.slice(0, 8).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setPurposeId(p.id);
                  setPurposeQuery(p.label);
                  if (!title) setTitle(p.label);
                }}
              >
                <strong>{p.label}</strong>
                <span>{p.defaultKind === 'scan' ? 'scan bench' : p.isSystem ? 'catalog' : 'custom'}</span>
              </button>
            </li>
          ))}
          {purposeQuery.trim() && !matches.some((p) => p.label.toLowerCase() === purposeQuery.trim().toLowerCase()) ? (
            <li className="session-composer-create">Create purpose “{purposeQuery.trim()}”</li>
          ) : null}
        </ul>
      ) : null}
      <label className="session-composer-field">
        <span>What I’m doing</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Helped Sam with inventory identification"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
      </label>
      <label className="session-composer-field">
        <span>Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Optional — running notes. Wrap-up on end is from → to, why."
        />
      </label>
      <div className="session-composer-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
          Start
        </button>
      </div>
    </div>
  );
}

function EndForm({ title, onCancel, onConfirm, busy }: SessionComposerEnd) {
  const [wrapUp, setWrapUp] = useState('');
  return (
    <div className="session-composer" role="dialog" aria-label="Wrap up session">
      <div className="session-composer-head">Wrap up · {title}</div>
      <p className="session-composer-hint">
        From → to, and why. Example: Amazon $89 → $84 to recapture Buy Box; eBay left at $89.
      </p>
      <label className="session-composer-field">
        <span>Summary</span>
        <textarea
          value={wrapUp}
          onChange={(e) => setWrapUp(e.target.value)}
          rows={4}
          autoFocus
          placeholder="What changed, from, to, why"
        />
      </label>
      <div className="session-composer-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => onConfirm({ wrapUp: wrapUp.trim() })}
        >
          End session
        </button>
      </div>
    </div>
  );
}
