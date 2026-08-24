'use client';

/**
 * Omni-Command Composer — Lexical document of text + entity chips.
 * The one field on the Warehouse OS feed (AssistantFeed / :3051 / Electron).
 */

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical';
import type { FindFieldSource } from '@/lib/keyboard/find-field-scan';
import type { ComposerEntityChip } from '@/lib/composer/document';
import { matchComposerTrigger } from '@/lib/composer/triggers';
import { routeComposerQuery } from '@/lib/composer/pattern-router';
import { hitToChip, resolveAutoCommitHit } from '@/lib/composer/lookup';
import { EntityChipNode, $createEntityChipNode } from './EntityChipNode';
import { ComposerGrammarPlugin } from './ComposerGrammarPlugin';

export interface OmniCommandComposerHandle {
  stripTrailing(suffix: string): void;
  commitToken(token: string, source: FindFieldSource): Promise<boolean>;
  getPlainText(): string;
  clear(): void;
  focus(): void;
}

export interface OmniCommandComposerProps {
  scanRef?: (el: HTMLElement | null) => void;
  placeholder?: string;
  onSend: (text: string) => void;
  onCommitEntity: (chip: ComposerEntityChip, source: FindFieldSource) => void;
  onDraftChange?: (text: string) => void;
}

const initialConfig = {
  namespace: 'OmniCommandComposer',
  onError: (error: Error) => {
    console.error('[OmniCommandComposer]', error);
  },
  nodes: [EntityChipNode],
  theme: {
    paragraph: 'occ-paragraph',
  },
};

export const OmniCommandComposer = forwardRef<OmniCommandComposerHandle, OmniCommandComposerProps>(
  function OmniCommandComposer(props, ref) {
    return (
      <LexicalComposer initialConfig={initialConfig}>
        <ComposerInner {...props} handleRef={ref} />
      </LexicalComposer>
    );
  },
);

function ComposerInner({
  scanRef,
  placeholder = 'Describe the work, or scan — it lands here…',
  onSend,
  onCommitEntity,
  onDraftChange,
  handleRef,
}: OmniCommandComposerProps & {
  handleRef: React.ForwardedRef<OmniCommandComposerHandle>;
}) {
  const [editor] = useLexicalComposerContext();
  const onCommitRef = useRef(onCommitEntity);
  onCommitRef.current = onCommitEntity;

  useImperativeHandle(handleRef, () => ({
    stripTrailing(suffix: string) {
      editor.update(() => {
        const text = $getRoot().getTextContent();
        if (!suffix || !text.endsWith(suffix)) return;
        replaceRootText(text.slice(0, text.length - suffix.length));
      });
    },
    async commitToken(token: string, source: FindFieldSource) {
      const trimmed = token.trim();
      if (!trimmed) return false;
      const match = matchComposerTrigger(trimmed);
      const route = routeComposerQuery(match?.kind ?? 'bare_identifier', match?.query ?? trimmed);
      const auto = await resolveAutoCommitHit(route);
      if (auto) {
        editor.update(() => appendChip(hitToChip(auto)));
        onCommitRef.current(hitToChip(auto), source);
        return true;
      }
      editor.update(() => appendPlain(trimmed));
      return false;
    },
    getPlainText() {
      let text = '';
      editor.getEditorState().read(() => {
        text = $getRoot().getTextContent();
      });
      return text.replace(/\s+/g, ' ').trim();
    },
    clear() {
      editor.update(() => replaceRootText(''));
    },
    focus() {
      editor.focus();
    },
  }));

  useEffect(() => {
    if (!onDraftChange) return;
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        onDraftChange($getRoot().getTextContent());
      });
    });
  }, [editor, onDraftChange]);

  const setEditable = useCallback(
    (el: HTMLDivElement | null) => {
      scanRef?.(el);
    },
    [scanRef],
  );

  const placeholderEl = useMemo(
    () => <div className="occ-placeholder">{placeholder}</div>,
    [placeholder],
  );

  return (
    <div className="occ-root">
      <PlainTextPlugin
        contentEditable={
          <ContentEditable
            ref={setEditable}
            className="occ-editor"
            aria-label="Omni-command composer"
            spellCheck={false}
          />
        }
        placeholder={placeholderEl}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <HistoryPlugin />
      <AutoFocusPlugin />
      <ComposerGrammarPlugin onCommitEntity={onCommitEntity} onSend={onSend} />
    </div>
  );
}

function replaceRootText(text: string): void {
  const root = $getRoot();
  root.clear();
  const p = $createParagraphNode();
  if (text) p.append($createTextNode(text));
  root.append(p);
}

function appendPlain(text: string): void {
  const root = $getRoot();
  let p = root.getLastChild();
  if (!p) {
    p = $createParagraphNode();
    root.append(p);
  }
  p.append($createTextNode(text));
  p.selectEnd();
}

function appendChip(chip: ComposerEntityChip): void {
  const root = $getRoot();
  let p = root.getLastChild();
  if (!p) {
    p = $createParagraphNode();
    root.append(p);
  }
  const node = $createEntityChipNode(chip);
  p.append(node);
  p.append($createTextNode(' '));
  p.selectEnd();
}
