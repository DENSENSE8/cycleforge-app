'use client';

/**
 * `@` mentions in the AI composer (plan §C.1, contract K6).
 *
 * Typing `@` opens a picker over the composer; `@order 48…`, `@sku 000…` and
 * `@bin C-03…` narrow it to one kind, a bare `@…` searches all three. Picking
 * a row inserts a plain-text token (`@bin C-03-12-3`) and records the EXACT
 * entity `{ kind, id, label }`; the surface sends `mentions` with the message
 * and the server names those ids to the model (`buildContextFragment`), so the
 * tool call gets the id the operator picked, not a re-typed guess.
 *
 * Sources — the same visibility the operator already has elsewhere:
 *   order → `/api/global-search?axis=order` (⌘K's engine, org-partitioned cache)
 *   sku   → `/api/inventory/sku-search?q=` (global-search does not match SKU
 *           strings like `00066-P`)
 *   bin   → `/api/inventory/bins-overview?q=` (global-search has no location arm)
 *
 * The field keeps focus the whole time: ↑/↓/Enter/Tab/Esc are handled in
 * `onKeyDown` (it calls `preventDefault`, so `AiComposer` skips its Enter
 * submit), and the list is a controlled cmdk `Command` for mouse picks.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { Command, CommandItem, CommandList } from '@/components/ui/command';
import { AI_PANEL_CLASS } from '@/design-system/ai/classes';
import type { AssistantMention } from '@/lib/assistant/context-store';
import { cn } from '@/utils/_cn';

export type ComposerMention = AssistantMention;
type MentionKind = ComposerMention['kind'];

interface MentionOption extends ComposerMention {
  /** Secondary line — product title, room · qty. */
  detail: string;
}

const DEBOUNCE_MS = 150;
const MIN_QUERY = 2;
const LIMIT = 8;

/**
 * The `@token` ending at the caret: optional kind word, then the query.
 * `@` must start the field or follow whitespace so emails never trigger it.
 */
const TRIGGER = /(^|\s)@(?:(order|sku|bin)\b\s*)?([^\s@]*)$/i;

interface Trigger {
  /** Index of the `@` in the field. */
  start: number;
  kind: MentionKind | null;
  query: string;
}

function readTrigger(value: string, caret: number): Trigger | null {
  const before = value.slice(0, caret);
  const m = TRIGGER.exec(before);
  if (!m) return null;
  return {
    start: m.index + m[1].length,
    kind: (m[2]?.toLowerCase() as MentionKind | undefined) ?? null,
    query: m[3],
  };
}

interface GlobalSearchRow {
  id: number;
  entityType: string;
  title: string;
  subtitle: string;
  facets?: { order_id?: string | null } | null;
}

interface SkuRow {
  sku: string;
  product_title: string | null;
  total_qty: number;
}

interface BinRow {
  name: string;
  room: string | null;
  total_qty: number;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  const res = await fetch(url, { signal, credentials: 'same-origin' });
  return res.ok ? ((await res.json()) as T) : null;
}

async function searchMentions(kind: MentionKind | null, query: string, signal: AbortSignal): Promise<MentionOption[]> {
  const q = encodeURIComponent(query);
  const wants = (k: MentionKind) => kind === null || kind === k;
  const [orders, skus, bins] = await Promise.all([
    wants('order')
      ? fetchJson<{ rows?: GlobalSearchRow[] }>(`/api/global-search?q=${q}&limit=${LIMIT}&axis=order`, signal)
      : null,
    wants('sku') ? fetchJson<{ results?: SkuRow[] }>(`/api/inventory/sku-search?q=${q}`, signal) : null,
    wants('bin') ? fetchJson<{ rows?: BinRow[] }>(`/api/inventory/bins-overview?q=${q}`, signal) : null,
  ]);
  const out: MentionOption[] = [];
  for (const row of orders?.rows ?? []) {
    if (row.entityType !== 'order') continue;
    const number = row.facets?.order_id?.trim() || row.title;
    out.push({ kind: 'order', id: String(row.id), label: `order ${number}`, detail: row.title });
  }
  for (const row of (skus?.results ?? []).slice(0, LIMIT)) {
    out.push({
      kind: 'sku',
      id: row.sku,
      label: `sku ${row.sku}`,
      detail: [row.product_title, `${row.total_qty} in bins`].filter(Boolean).join(' · '),
    });
  }
  for (const bin of (bins?.rows ?? []).slice(0, LIMIT)) {
    out.push({
      kind: 'bin',
      id: bin.name,
      label: `bin ${bin.name}`,
      detail: [bin.room, `${bin.total_qty} on hand`].filter(Boolean).join(' · '),
    });
  }
  return out.slice(0, LIMIT);
}

const optionKey = (o: ComposerMention) => `${o.kind}:${o.id}`;

export interface UseComposerMentionsArgs {
  value: string;
  onChange: (next: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement>;
}

export interface ComposerMentions {
  /** Picked entities whose `@label` is still in the draft — send these. */
  mentions: ComposerMention[];
  /** The picker, positioned above the field; null when closed. */
  overlay: ReactNode;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  /** Forget every mention (after send / new chat). */
  reset: () => void;
}

export function useComposerMentions({ value, onChange, textareaRef }: UseComposerMentionsArgs): ComposerMentions {
  const [picked, setPicked] = useState<ComposerMention[]>([]);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [options, setOptions] = useState<MentionOption[]>([]);
  const [active, setActive] = useState(0);
  /** Esc closes the picker until the token changes. */
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  // Re-read the token at the caret on every draft change. The caret is read
  // after React commits the value, so the trigger always matches the text.
  useEffect(() => {
    const field = textareaRef.current;
    const caret = field ? field.selectionStart ?? value.length : value.length;
    const next = readTrigger(value, caret);
    setTrigger((prev) =>
      prev?.start === next?.start && prev?.kind === next?.kind && prev?.query === next?.query ? prev : next,
    );
  }, [value, textareaRef]);

  useEffect(() => {
    if (!trigger || trigger.query.length < MIN_QUERY || dismissedAt === trigger.start) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchMentions(trigger.kind, trigger.query, controller.signal)
        .then((rows) => {
          setOptions(rows);
          setActive(0);
        })
        .catch(() => {
          /* aborted or offline — the picker just stays empty */
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trigger, dismissedAt]);

  const open = trigger !== null && options.length > 0 && dismissedAt !== trigger.start;

  const choose = useCallback(
    (option: MentionOption) => {
      const field = textareaRef.current;
      const current = valueRef.current;
      const caret = field ? field.selectionStart ?? current.length : current.length;
      const at = readTrigger(current, caret);
      if (!at) return;
      const token = `@${option.label} `;
      const next = `${current.slice(0, at.start)}${token}${current.slice(caret)}`;
      onChange(next);
      setPicked((prev) => [
        ...prev.filter((m) => optionKey(m) !== optionKey(option)),
        { kind: option.kind, id: option.id, label: option.label },
      ]);
      setOptions([]);
      setTrigger(null);
      const nextCaret = at.start + token.length;
      requestAnimationFrame(() => {
        field?.focus();
        field?.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [onChange, textareaRef],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!open || e.nativeEvent.isComposing) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setActive((i) => (i + step + options.length) % options.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const option = options[active];
        if (option) choose(option);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setDismissedAt(trigger?.start ?? null);
      }
    },
    [open, options, active, choose, trigger],
  );

  const mentions = useMemo(
    () => picked.filter((m) => value.includes(`@${m.label}`)),
    [picked, value],
  );

  const reset = useCallback(() => {
    setPicked([]);
    setOptions([]);
    setTrigger(null);
    setDismissedAt(null);
  }, []);

  const activeKey = options[active] ? optionKey(options[active]) : '';
  const overlay: ReactNode = open ? (
    <div className={cn(AI_PANEL_CLASS, 'absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden')}>
      <Command value={activeKey} shouldFilter={false} className="bg-transparent" label="Mention">
        <CommandList className="max-h-72 p-1">
          {options.map((option) => (
            <CommandItem
              key={optionKey(option)}
              value={optionKey(option)}
              onMouseDown={(e) => e.preventDefault()}
              onSelect={() => choose(option)}
              className="flex-col items-start gap-0.5"
            >
              <span className="text-ai-prose text-ai-ink">@{option.label}</span>
              {option.detail ? <span className="truncate text-ai-label text-ai-faint">{option.detail}</span> : null}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </div>
  ) : null;

  return { mentions, overlay, onKeyDown, reset };
}
