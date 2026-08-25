'use client';

/**
 * The Omni-Command Composer — the ONE field on the Warehouse OS default
 * screen. A Lexical plain-text editor that chips identifiers, runs `/`
 * actions, talks prose to the assistant, and receives the scanner through
 * the same contenteditable (docs/omni-command-composer.md).
 *
 * The host (AssistantFeed) supplies the commit sink and the wedge capture;
 * this component owns only the editor surface. `.occ-root` is the positioning
 * context for the attached typeahead listbox — the menu never leaves the
 * control (I6).
 */

import { useState } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { EntityChipNode } from './EntityChipNode';
import {
  ComposerGrammarPlugin,
  type OmniComposerHandle,
} from './ComposerGrammarPlugin';
import type { ComposerCommit } from '@/lib/composer/commit';

export type { OmniComposerHandle };

export interface OmniCommandComposerProps {
  onCommit: (commit: ComposerCommit) => void;
  onDraftChange?: (hasProse: boolean) => void;
  handleRef?: React.MutableRefObject<OmniComposerHandle | null>;
  attachScanCapture?: (el: HTMLElement | null) => void;
}

export function OmniCommandComposer({
  onCommit,
  onDraftChange,
  handleRef,
  attachScanCapture,
}: OmniCommandComposerProps) {
  const [rootEl, setRootEl] = useState<HTMLElement | null>(null);

  return (
    <LexicalComposer
      initialConfig={{
        namespace: 'omni-command-composer',
        nodes: [EntityChipNode],
        theme: { paragraph: 'occ-paragraph' },
        onError: (error: Error) => {
          throw error;
        },
      }}
    >
      <div className="occ-root" ref={setRootEl}>
        <PlainTextPlugin
          contentEditable={
            <ContentEditable
              className="occ-editor"
              aria-label="Omni-command composer"
              data-testid="omni-command-composer"
            />
          }
          placeholder={
            <span className="occ-placeholder" aria-hidden>
              Order #, / for actions, or describe the work — scans land here…
            </span>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ComposerGrammarPlugin
          onCommit={onCommit}
          onDraftChange={onDraftChange}
          handleRef={handleRef}
          attachScanCapture={attachScanCapture}
          anchorParent={rootEl}
        />
      </div>
    </LexicalComposer>
  );
}
