'use client';

/**
 * P4 Studio on the phone — `/m/id/methods`.
 *
 * Author (AI or local) → human save draft → human publish. Same
 * IdentificationGrammarBody as a hand-written method. No per-tenant *-face.ts.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { MobileDetailTopBar } from '@/components/mobile/redesign/MobileDetailTopBar';
import { Button, TextField } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';
import type { IdentificationGrammarBody } from '@/lib/schemas/identification-grammar';

type MethodRow = {
  jobId: string;
  grammar: IdentificationGrammarBody;
  publishedAt: string | null;
};

type AuthorJson = {
  ok: boolean;
  source?: 'ai' | 'deterministic';
  grammar?: IdentificationGrammarBody;
  error?: string;
};

export default function MobileIdentificationMethodsPage() {
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const queryClient = useQueryClient();
  const [brief, setBrief] = useState(
    'Barcodes start with RMA- then the order id. job id acme_rma',
  );
  const [draft, setDraft] = useState<IdentificationGrammarBody | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['identification', 'methods'],
    enabled: isLoaded && Boolean(user?.organizationId),
    queryFn: async (): Promise<MethodRow[]> => {
      const res = await fetch('/api/identification/methods');
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: MethodRow[];
        error?: string;
      };
      if (!res.ok || !json.ok) throw new Error(json.error || `methods ${res.status}`);
      return json.items ?? [];
    },
  });

  const author = useMutation({
    mutationFn: async (): Promise<AuthorJson> => {
      const res = await fetch('/api/identification/methods/author', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief }),
      });
      return (await res.json()) as AuthorJson;
    },
    onSuccess: (json) => {
      if (!json.ok || !json.grammar) {
        setMessage(json.error || 'Author failed');
        return;
      }
      setDraft(json.grammar);
      setMessage(`Draft from ${json.source ?? 'author'}. Save, then Publish.`);
    },
  });

  const save = useMutation({
    mutationFn: async (grammar: IdentificationGrammarBody) => {
      const res = await fetch('/api/identification/methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(grammar),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `save ${res.status}`);
    },
    onSuccess: () => {
      setMessage('Draft saved. Publish to arm the gun path.');
      void queryClient.invalidateQueries({ queryKey: ['identification', 'methods'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const publish = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await fetch(`/api/identification/methods/${encodeURIComponent(jobId)}/publish`, {
        method: 'POST',
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || `publish ${res.status}`);
    },
    onSuccess: (_void, jobId) => {
      setMessage('Published. Classify is compiled Zod only.');
      void queryClient.invalidateQueries({ queryKey: ['identification', 'methods'] });
      router.push(`/m/id/${encodeURIComponent(jobId)}/42`);
    },
    onError: (err: Error) => setMessage(err.message),
  });

  const preview = useMemo(
    () => (draft ? JSON.stringify(draft, null, 2) : ''),
    [draft],
  );

  return (
    <div className="flex h-full flex-col bg-surface-canvas">
      <MobileDetailTopBar backHref="/m/scan" subtitle="Identify" title="Methods" />
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pt-4 pb-8">
        {!isLoaded || !user ? (
          <p className="text-role-caption text-text-muted">Loading…</p>
        ) : (
          <>
            <TextField label="Brief" value={brief} onChange={setBrief} multiline />
            <Button
              type="button"
              variant="primary"
              loading={author.isPending}
              onClick={() => author.mutate()}
              className="self-start"
            >
              Author
            </Button>
            {preview ? (
              <pre
                className={cn(
                  'overflow-x-auto p-3 font-mono text-role-micro text-text-default',
                  'bg-surface-card',
                  cornerClass('surface'),
                )}
              >
                {preview}
              </pre>
            ) : null}
            {draft ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  loading={save.isPending}
                  onClick={() => save.mutate(draft)}
                >
                  Save draft
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  loading={publish.isPending}
                  onClick={() => {
                    void save.mutateAsync(draft).then(() => publish.mutate(draft.jobId));
                  }}
                >
                  Publish
                </Button>
              </div>
            ) : null}
            {message ? <p className="text-role-caption text-text-muted">{message}</p> : null}
            <div className="flex flex-col gap-2">
              <p className="text-role-micro font-semibold uppercase tracking-widest text-text-muted">
                This org
              </p>
              {(list.data ?? []).map((row) => (
                <div
                  key={row.jobId}
                  className={cn(
                    'flex items-center justify-between gap-2 p-3',
                    'bg-surface-card',
                    cornerClass('surface'),
                  )}
                >
                  <div>
                    <p className="font-mono text-role-caption">{row.jobId}</p>
                    <p className="text-role-micro text-text-muted">
                      {row.publishedAt ? 'Published' : 'Draft'}
                    </p>
                  </div>
                  {!row.publishedAt ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => publish.mutate(row.jobId)}
                    >
                      Publish
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => router.push(`/m/id/${encodeURIComponent(row.jobId)}/42`)}
                    >
                      Open claim
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
