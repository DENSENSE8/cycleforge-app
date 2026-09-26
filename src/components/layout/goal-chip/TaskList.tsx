'use client';

/** The shared checklist list — used by the Recurring and To-do modes of the header's pace-and-next panel. */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from '@/design-system/motion';
import { Check, Plus, X } from '@/components/Icons';
import { cn } from '@/utils/_cn';
import { Button, IconButton } from '@/design-system/primitives';
import type { Todo } from './goal-chip-shared';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { TaskRowMenu } from './TaskRowMenu';

export function TaskList({
  items,
  onToggle,
  onRemove,
  onRename,
  touch = false,
  adding,
  draft,
  onDraft,
  onAdd,
  onStartAdd,
  onCancelAdd,
  emptyHint,
  placeholder,
  addLabel,
}: {
  items: Todo[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  /** Commit a rename. */
  onRename?: (id: string, text: string) => void;
  /** Sheet density — 44px rows and targets. */
  touch?: boolean;
  adding: boolean;
  draft: string;
  onDraft: (v: string) => void;
  onAdd: () => void;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  emptyHint: string;
  placeholder: string;
  addLabel: string;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  // Focus the field the moment a row becomes the editor.
  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  const startEdit = (t: Todo) => {
    setEditingId(t.id);
    setEditDraft(t.text);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };
  const commitEdit = (id: string) => {
    const next = editDraft.trim();
    if (next) onRename?.(id, next);
    cancelEdit();
  };

  const rowPad = touch ? 'px-3 py-3' : 'px-2 py-2';
  const rowText = touch ? 'text-role-data' : 'text-role-caption';
  const boxSize = touch ? 'h-6 w-6' : 'h-[18px] w-[18px]';

  return (
    <>
      {items.length === 0 && !adding && (
        <p className={cn('px-2 py-3 text-center text-text-faint', rowText)}>{emptyHint}</p>
      )}
      {items.map((t) => {
        const editing = editingId === t.id;
        return (
          <div
            key={t.id}
            className={cn(
              'flex items-center gap-2.5 rounded-none transition-colors hover:bg-surface-hover',
              rowPad,
              touch && 'min-h-[52px]',
            )}
          >
            {editing ? (
              <>
                <input
                  ref={editRef}
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit(t.id);
                    if (e.key === 'Escape') cancelEdit();
                  }}
                  onBlur={() => commitEdit(t.id)}
                  aria-label={`Rename ${t.text}`}
                  className={cn(
                    'min-w-0 flex-1 rounded-none border border-border-soft bg-surface-card px-2 py-1.5 text-text-default',
                    rowText,
                    touch && 'min-h-[44px] text-base',
                    focusRing('field', 'accent'),
                  )}
                />
                <IconButton
                  size={touch ? 'touch' : 'sm'}
                  icon={<Check className={touch ? 'h-5 w-5' : 'h-3.5 w-3.5'} />}
                  ariaLabel="Save task name"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commitEdit(t.id)}
                  className="shrink-0 text-emerald-600"
                />
              </>
            ) : (
              <>
                {/* ds-raw-button: custom checkbox toggle (emerald fill + motion child + aria-pressed) */}
                <button
                  type="button"
                  onClick={() => onToggle(t.id)}
                  aria-label={t.done ? `Mark ${t.text} not done` : `Mark ${t.text} done`}
                  className={cn(
                    'flex shrink-0 items-center justify-center rounded-none ring-1 transition-colors',
                    boxSize,
                    t.done ? 'bg-emerald-500 ring-emerald-500' : 'bg-surface-card ring-border-default',
                  )}
                  aria-pressed={t.done}
                >
                  <AnimatePresence>
                    {t.done && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 30 }}
                      >
                        <Check className={touch ? 'h-4 w-4 text-white' : 'h-3 w-3 text-white'} />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
                {/* ds-raw-button: flex-1 left-aligned text row (the label is the hit target) */}
                <button
                  type="button"
                  onClick={() => onToggle(t.id)}
                  className={cn(
                    'min-w-0 flex-1 truncate text-left font-semibold transition-colors',
                    rowText,
                    t.done ? 'text-text-faint line-through' : 'text-text-default',
                  )}
                >
                  {t.text}
                </button>
                <TaskRowMenu
                  label={t.text}
                  done={t.done}
                  touch={touch}
                  onEdit={() => startEdit(t)}
                  onToggle={() => onToggle(t.id)}
                  onDelete={() => onRemove(t.id)}
                />
              </>
            )}
          </div>
        );
      })}

      {adding ? (
        <div className={cn('flex items-center gap-1.5', touch ? 'px-3 py-2' : 'px-2 py-1.5')}>
          <input
            autoFocus
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onAdd();
              if (e.key === 'Escape') onCancelAdd();
            }}
            placeholder={placeholder}
            className={cn(
              'w-full rounded-none border border-border-soft px-2.5 py-1.5 text-text-default',
              rowText,
              touch && 'min-h-[44px] text-base',
              focusRing('field', 'accent'),
            )}
          />
          <Button
            variant="primary"
            size={touch ? 'md' : 'sm'}
            onClick={onAdd}
            className={cn('shrink-0 font-semibold', rowText)}
          >
            Add
          </Button>
          <IconButton
            size={touch ? 'touch' : 'sm'}
            icon={<X className={touch ? 'h-5 w-5' : 'h-3.5 w-3.5'} />}
            ariaLabel="Cancel"
            onClick={onCancelAdd}
            className="shrink-0 text-text-faint hover:bg-surface-sunken"
          />
        </div>
      ) : (
        <Button
          variant="ghost"
          icon={<Plus className={touch ? 'h-4 w-4' : 'h-3.5 w-3.5'} />}
          onClick={onStartAdd}
          className={cn(
            'mt-0.5 w-full justify-start gap-2 rounded-none font-semibold text-blue-600 hover:bg-surface-hover',
            rowPad,
            rowText,
            touch && 'min-h-[48px]',
          )}
        >
          {addLabel}
        </Button>
      )}
    </>
  );
}
