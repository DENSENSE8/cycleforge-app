'use client';

/**
 * A package's tags: what is pinned on it (tap ✕ to unpin), the presets one
 * tap away, and a custom label for anything else. Writes go through
 * `/api/orders/[id]/tags`; the board refreshes so the card shows them too.
 */

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X } from '@/components/Icons';
import { Button } from '@/design-system/primitives/Button';
import { TextField } from '@/design-system/primitives/TextField';
import { LIVE_FEED_QUERY_ROOT } from '@/lib/live-feed/query';
import { normalizePackageTag, PACKAGE_TAG_MAX, PACKAGE_TAG_PRESETS } from '@/lib/live-feed/tags';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';
import { TagPill } from './pills';

async function writeTag(orderRowId: number, tag: string, op: 'add' | 'remove'): Promise<string[]> {
  const res = await fetch(`/api/orders/${orderRowId}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag, op }),
  });
  if (!res.ok) throw new Error(`tag ${res.status}`);
  const body: unknown = await res.json();
  if (!body || typeof body !== 'object' || !('tags' in body) || !Array.isArray(body.tags)) throw new Error('tag: bad response');
  return body.tags.filter((tag): tag is string => typeof tag === 'string');
}

export function PackageTags({ orderRowId, tags }: { orderRowId: number; tags: readonly string[] }) {
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState<readonly string[]>(tags);
  const [custom, setCustom] = useState('');
  useEffect(() => setCurrent(tags), [tags]);

  const mutation = useMutation({
    mutationFn: ({ tag, op }: { tag: string; op: 'add' | 'remove' }) => writeTag(orderRowId, tag, op),
    onMutate: ({ tag, op }) => {
      const before = current;
      setCurrent(op === 'add' ? [...current, tag] : current.filter((held) => held.toLowerCase() !== tag.toLowerCase()));
      return { before };
    },
    onError: (_error, _vars, context) => {
      if (context) setCurrent(context.before);
      toast.error("Couldn't save the tag");
    },
    onSuccess: (next) => {
      setCurrent(next);
      void queryClient.invalidateQueries({ queryKey: LIVE_FEED_QUERY_ROOT });
    },
  });

  const held = new Set(current.map((tag) => tag.toLowerCase()));
  const add = (raw: string) => {
    const tag = normalizePackageTag(raw);
    if (!tag || held.has(tag.toLowerCase())) return;
    mutation.mutate({ tag, op: 'add' });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="live-feed-tags">
      {current.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {current.map((tag) => (
            <TagPill key={tag} tag={tag}>
              {/* ds-raw-button: the pill's own ✕ — a 16px glyph inside a 20px pill, below every IconButton size. */}
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                onClick={() => mutation.mutate({ tag, op: 'remove' })}
                className="-mr-1 flex size-4 items-center justify-center rounded-full opacity-60 hover:bg-black/5 hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </TagPill>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No tags yet — pin what the next person needs to know.</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {PACKAGE_TAG_PRESETS.filter((preset) => !held.has(preset.label.toLowerCase())).map((preset) => (
          // ds-raw-button: a preset is an outlined "+ label" chip in the tag's own pill shape, not a Button face.
          <button
            key={preset.label}
            type="button"
            onClick={() => add(preset.label)}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 text-xs font-medium text-slate-600 transition',
              'hover:border-slate-400 hover:bg-white hover:text-slate-900',
            )}
          >
            <Plus className="size-3" />
            {preset.label}
          </button>
        ))}
      </div>

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add(custom);
          setCustom('');
        }}
      >
        <TextField
          label="Custom tag"
          value={custom}
          onChange={setCustom}
          maxLength={PACKAGE_TAG_MAX}
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="secondary" size="lg" radius="pill" disabled={!normalizePackageTag(custom)}>
          Add
        </Button>
      </form>
    </div>
  );
}
