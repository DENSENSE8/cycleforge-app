'use client';

/**
 * Grammar plugin — trigger mapping, pattern routing, typeahead, auto-commit.
 * Attached listbox (not a floating instrument). Instant mount (M1).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  type MenuRenderFn,
  type TriggerFn,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  type TextNode,
} from 'lexical';
import { createPortal } from 'react-dom';
import type { FindFieldSource } from '@/lib/keyboard/find-field-scan';
import type { ComposerTriggerKind } from '@/lib/composer/triggers';
import { matchComposerTrigger } from '@/lib/composer/triggers';
import { routeComposerQuery } from '@/lib/composer/pattern-router';
import { shouldAutoCommit } from '@/lib/composer/auto-commit';
import {
  hitToChip,
  searchComposerHits,
  type ComposerHit,
} from '@/lib/composer/lookup';
import type { ComposerEntityChip } from '@/lib/composer/document';
import { $createEntityChipNode } from './EntityChipNode';

class HitOption extends MenuOption {
  hit: ComposerHit;
  constructor(hit: ComposerHit) {
    super(`${hit.entityType}:${hit.id}`);
    this.hit = hit;
  }
}

export function ComposerGrammarPlugin({
  onCommitEntity,
  onSend,
}: {
  onCommitEntity: (chip: ComposerEntityChip, source: FindFieldSource) => void;
  onSend: (text: string) => void;
}) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);
  const [options, setOptions] = useState<HitOption[]>([]);
  const kindRef = useRef<ComposerTriggerKind>('bare_identifier');
  const menuOpenRef = useRef(false);
  const autoCommitted = useRef<string | null>(null);

  const triggerFn: TriggerFn = useCallback((text) => {
    const match = matchComposerTrigger(text);
    if (!match) return null;
    kindRef.current = match.kind;
    return {
      leadOffset: match.start,
      matchingString: match.query,
      replaceableString: text.slice(match.start),
    };
  }, []);

  useEffect(() => {
    if (query == null) {
      setOptions([]);
      menuOpenRef.current = false;
      return;
    }
    const route = routeComposerQuery(kindRef.current, query);
    let cancelled = false;
    const wait = route.complete ? 0 : 80;
    const timer = window.setTimeout(() => {
      void searchComposerHits(route).then((hits) => {
        if (cancelled) return;
        if (shouldAutoCommit(route, hits.length) && hits[0]) {
          const key = `${route.token}:${hits[0].id}`;
          if (autoCommitted.current === key) return;
          autoCommitted.current = key;
          editor.update(() => replaceQueryWithChip(hits[0]!));
          onCommitEntity(hitToChip(hits[0]!), 'human');
          setOptions([]);
          menuOpenRef.current = false;
          return;
        }
        autoCommitted.current = null;
        setOptions(hits.map((h) => new HitOption(h)));
        menuOpenRef.current = hits.length > 0;
      });
    }, wait);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [editor, onCommitEntity, query]);

  const onSelectOption = useCallback(
    (option: HitOption, nodeToReplace: TextNode | null, closeMenu: () => void) => {
      editor.update(() => {
        const chip = $createEntityChipNode(hitToChip(option.hit));
        if (nodeToReplace) nodeToReplace.replace(chip);
        else replaceQueryWithChip(option.hit);
        const space = $createTextNode(' ');
        chip.insertAfter(space);
        space.select();
      });
      closeMenu();
      menuOpenRef.current = false;
      onCommitEntity(hitToChip(option.hit), 'human');
    },
    [editor, onCommitEntity],
  );

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event) => {
        if (menuOpenRef.current) return false;
        if (event?.shiftKey) return false;
        event?.preventDefault();
        let text = '';
        editor.getEditorState().read(() => {
          text = $getRoot().getTextContent();
        });
        const trimmed = text.replace(/\s+/g, ' ').trim();
        if (!trimmed) return true;
        onSend(trimmed);
        editor.update(() => {
          $getRoot().clear();
        });
        return true;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, onSend]);

  const menuRenderFn: MenuRenderFn<HitOption> = (
    anchorRef,
    { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex, options: opts },
  ) => {
    if (opts.length === 0 || !anchorRef.current) return null;
    return createPortal(
      <ul className="occ-typeahead" role="listbox" aria-label="Composer matches">
        {opts.map((opt, i) => (
          <li
            key={opt.key}
            role="option"
            aria-selected={selectedIndex === i}
            className={selectedIndex === i ? 'occ-typeahead-item is-active' : 'occ-typeahead-item'}
            ref={opt.setRefElement}
            onMouseEnter={() => setHighlightedIndex(i)}
            onMouseDown={(e) => {
              e.preventDefault();
              selectOptionAndCleanUp(opt);
            }}
          >
            <span className="occ-typeahead-label">{opt.hit.label}</span>
            {opt.hit.subtitle ? (
              <span className="occ-typeahead-sub">{opt.hit.subtitle}</span>
            ) : null}
            {opt.hit.platform ? (
              <span className="occ-typeahead-platform">{opt.hit.platform}</span>
            ) : null}
          </li>
        ))}
      </ul>,
      anchorRef.current,
    );
  };

  return (
    <LexicalTypeaheadMenuPlugin<HitOption>
      triggerFn={triggerFn}
      options={options}
      onQueryChange={setQuery}
      onSelectOption={onSelectOption}
      menuRenderFn={menuRenderFn}
      parent={typeof document === 'undefined' ? undefined : document.body}
      preselectFirstItem
    />
  );
}

function replaceQueryWithChip(hit: ComposerHit): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  const node = selection.anchor.getNode();
  if (!$isTextNode(node)) {
    selection.insertNodes([$createEntityChipNode(hitToChip(hit))]);
    return;
  }
  const content = node.getTextContent();
  const match = matchComposerTrigger(content);
  const chip = $createEntityChipNode(hitToChip(hit));
  if (!match) {
    selection.insertNodes([chip]);
    return;
  }
  const before = content.slice(0, match.start);
  if (before) {
    node.setTextContent(before);
    node.insertAfter(chip);
  } else {
    node.replace(chip);
  }
  const space = $createTextNode(' ');
  chip.insertAfter(space);
  space.select();
}
