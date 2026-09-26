'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { useStepUp } from '@/components/providers/StepUpProvider';
import { fetchWithStepUp } from '@/components/auth/StepUpModal';
import { toast } from '@/lib/toast';
import type { Annotation, StudioGraphEdge, StudioGraphNode } from '../studio-types';
import type { Busy } from './types';

interface StudioPublishParams {
  definitionId: number | null;
  dirty: boolean;
  draftNodes: StudioGraphNode[];
  draftEdges: StudioGraphEdge[];
  draftAnnotations: Annotation[];
  setDirty: Dispatch<SetStateAction<boolean>>;
  setBusy: Dispatch<SetStateAction<Busy>>;
  setActionError: Dispatch<SetStateAction<string | null>>;
  setReloadNonce: Dispatch<SetStateAction<number>>;
  setImportingTemplateId: Dispatch<SetStateAction<number | null>>;
  setParams: (patch: Record<string, string | null>) => void;
}

/** Draft lifecycle (ST4): create / save / publish / discard + template import. */
export function useStudioPublish({
  definitionId,
  dirty,
  draftNodes,
  draftEdges,
  draftAnnotations,
  setDirty,
  setBusy,
  setActionError,
  setReloadNonce,
  setImportingTemplateId,
  setParams,
}: StudioPublishParams) {
  const requestStepUp = useStepUp();

  const createDraft = useCallback(async () => {
    setBusy('drafting');
    setActionError(null);
    try {
      const res = await fetch('/api/studio/definitions/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(definitionId ? { sourceId: definitionId } : {}),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'draft creation failed');
      setParams({ v: String(data.id), focus: null, z: null });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'draft creation failed');
    } finally {
      setBusy(null);
    }
  }, [definitionId, setParams]);

  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (!definitionId) return false;
    setBusy('saving');
    setActionError(null);
    try {
      const res = await fetch(`/api/studio/definitions/${definitionId}/graph`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: draftNodes.map(({ id, type, x, y, config }) => ({ id, type, x, y, config })),
          edges: draftEdges.map(({ id, source, sourcePort, target }) => ({ id, source, sourcePort, target })),
          annotations: draftAnnotations.map(({ id, text, x, y, color }) => ({ id, text, x, y, color })),
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'save failed');
      setDirty(false);
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'save failed');
      return false;
    } finally {
      setBusy(null);
    }
  }, [definitionId, draftNodes, draftEdges, draftAnnotations]);

  const publish = useCallback(async () => {
    if (!definitionId) return;
    if (dirty && !(await saveDraft())) return;
    setBusy('publishing');
    setActionError(null);
    try {
      const res = await fetchWithStepUp(
        `/api/studio/definitions/${definitionId}/publish`,
        { method: 'POST' },
        requestStepUp,
      );
      const data = await res.json();
      if (!data.ok) {
        if (data.error === 'PUBLISH_BLOCKED') {
          setParams({ lens: 'gaps' });
          throw new Error(
            `Publish blocked by ${data.diagnostics?.length ?? 0} error(s) — fix the Issues rail first.`,
          );
        }
        throw new Error(data.error || 'publish failed');
      }
      setParams({ v: null, focus: null });
      setReloadNonce((n) => n + 1); // v may already be null — force the refetch
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'publish failed');
    } finally {
      setBusy(null);
    }
  }, [definitionId, dirty, saveDraft, requestStepUp, setParams]);

  // Discard the draft:
  const discardDraft = useCallback(async () => {
    if (!definitionId) return;
    setBusy('discarding');
    setActionError(null);
    try {
      const res = await fetch(`/api/studio/definitions/${definitionId}/discard`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'discard failed');
      setParams({ v: null, focus: null, z: null });
      setReloadNonce((n) => n + 1); // v may already be null — force the refetch
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'discard failed');
    } finally {
      setBusy(null);
    }
  }, [definitionId, setParams]);

  // Import a system template:
  const importTemplate = useCallback(
    async (templateId: number) => {
      setImportingTemplateId(templateId);
      setActionError(null);
      try {
        const res = await fetch(`/api/studio/templates/${templateId}/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || 'template import failed');
        setParams({ v: String(data.id), focus: null, z: null });
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'template import failed');
      } finally {
        setImportingTemplateId(null);
      }
    },
    [setParams],
  );

  // Submit the current definition to the community catalog for curator review.
  const submitToCatalog = useCallback(async () => {
    if (!definitionId) return;
    setBusy('submitting');
    setActionError(null);
    try {
      const res = await fetch(`/api/studio/definitions/${definitionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'catalog submission failed');
      toast.success('Submitted to the community catalog for curator review');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'catalog submission failed');
    } finally {
      setBusy(null);
    }
  }, [definitionId]);

  return { createDraft, saveDraft, publish, discardDraft, importTemplate, submitToCatalog };
}
