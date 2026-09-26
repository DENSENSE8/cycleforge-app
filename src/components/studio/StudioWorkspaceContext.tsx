'use client';

/** StudioWorkspaceContext — the single owner of all Operations Studio client state. */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { StudioZoom } from './studio-types';
import type { StudioWorkspaceValue } from './studio-workspace/types';
import { useStudioViewState } from './studio-workspace/useStudioViewState';
import { useStudioGraphData } from './studio-workspace/useStudioGraphData';
import { useStudioGraphMutations } from './studio-workspace/useStudioGraphMutations';
import { useStudioPublish } from './studio-workspace/useStudioPublish';
import { useStudioLensState } from './studio-workspace/useStudioLensState';
import { useStudioStation } from './studio-workspace/useStudioStation';

export type { StudioWorkspaceValue };

const StudioWorkspaceContext = createContext<StudioWorkspaceValue | undefined>(undefined);

export function StudioWorkspaceProvider({ children }: { children: ReactNode }) {
  const { active, v, focus, zParam, lens, setParams } = useStudioViewState();
  const { has, user } = useAuth();

  // ─── Draft editing state (ST4) ───
  const canManage = has('studio.manage');

  const {
    graph,
    error,
    setReloadNonce,
    draftNodes,
    setDraftNodes,
    draftEdges,
    setDraftEdges,
    draftAnnotations,
    setDraftAnnotations,
    dirty,
    setDirty,
    busy,
    setBusy,
    actionError,
    setActionError,
    templates,
    importingTemplateId,
    setImportingTemplateId,
    isDraft,
    editing,
    nodes,
    edges,
    annotations,
    palette,
    paletteByType,
    diagnostics,
    definitionId,
    markDirty,
  } = useStudioGraphData({ active, v, canManage });

  // Editing forces L1 (the canvas is the only editable surface).
  const z: StudioZoom = editing ? 1 : zParam;

  const {
    onGraphChange,
    onAddNode,
    onUpdateNodeConfig,
    onDeleteNode,
    onAddAnnotation,
    onMoveAnnotation,
    onUpdateAnnotationText,
    onDeleteAnnotation,
  } = useStudioGraphMutations({
    focus,
    paletteByType,
    setDraftNodes,
    setDraftEdges,
    setDraftAnnotations,
    setParams,
    markDirty,
  });

  const { createDraft, saveDraft, publish, discardDraft, importTemplate, submitToCatalog } = useStudioPublish({
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
  });

  const {
    live,
    liveNodes,
    flowEdges,
    flowData,
    flowLoading,
    peopleData,
    peopleNodes,
    peopleLoading,
  } = useStudioLensState({ active, v, lens, editing, graph, organizationId: user?.organizationId });

  const { station, stationLoading, reloadStation } = useStudioStation({ active, z, focus });

  const focusedNode = useMemo(() => nodes.find((n) => n.id === focus) ?? null, [nodes, focus]);

  const value = useMemo<StudioWorkspaceValue>(
    () => ({
      active,
      v,
      focus,
      z,
      lens,
      setParams,
      graph,
      error,
      nodes,
      edges,
      annotations,
      palette,
      diagnostics,
      focusedNode,
      live,
      liveNodes,
      flowEdges,
      flow: flowData,
      flowLoading,
      people: peopleData,
      peopleNodes,
      peopleLoading,
      station,
      stationLoading,
      reloadStation,
      canManage,
      isDraft,
      editing,
      dirty,
      busy,
      actionError,
      templates,
      importingTemplateId,
      onGraphChange,
      onAddNode,
      onUpdateNodeConfig,
      onDeleteNode,
      onAddAnnotation,
      onMoveAnnotation,
      onUpdateAnnotationText,
      onDeleteAnnotation,
      createDraft,
      saveDraft,
      publish,
      discardDraft,
      importTemplate,
      submitToCatalog,
    }),
    [
      active,
      v,
      focus,
      z,
      lens,
      setParams,
      graph,
      error,
      nodes,
      edges,
      annotations,
      palette,
      diagnostics,
      focusedNode,
      live,
      liveNodes,
      flowEdges,
      flowData,
      flowLoading,
      peopleData,
      peopleNodes,
      peopleLoading,
      station,
      stationLoading,
      reloadStation,
      canManage,
      isDraft,
      editing,
      dirty,
      busy,
      actionError,
      templates,
      importingTemplateId,
      onGraphChange,
      onAddNode,
      onUpdateNodeConfig,
      onDeleteNode,
      onAddAnnotation,
      onMoveAnnotation,
      onUpdateAnnotationText,
      onDeleteAnnotation,
      createDraft,
      saveDraft,
      publish,
      discardDraft,
      importTemplate,
      submitToCatalog,
    ],
  );

  return <StudioWorkspaceContext.Provider value={value}>{children}</StudioWorkspaceContext.Provider>;
}

export function useStudioWorkspace(): StudioWorkspaceValue {
  const ctx = useContext(StudioWorkspaceContext);
  if (!ctx) throw new Error('useStudioWorkspace must be used within a StudioWorkspaceProvider');
  return ctx;
}
