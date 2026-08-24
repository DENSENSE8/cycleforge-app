'use client';

/**
 * The composer's grammar engine: trigger typeahead, deterministic auto-commit,
 * Enter arbitration, and the scanner hand-off. One plugin so the pieces that
 * must agree (menu-open vs Enter, auto-commit vs typed-ahead text) share refs
 * instead of racing through state.
 *
 * ## The kind ref
 *
 * `triggerFn` sees the full text before the caret and classifies the trailing
 * token; the debounced search effect only ever receives `matchingString`. The
 * classification is stashed in `kindRef` at trigger time so `#04-15`, `/pack`
 * and a bare identifier still route to the right domain after the debounce —
 * re-deriving the kind from the query string alone cannot tell them apart.
 *
 * ## The typeahead is the control's own listbox (I6)
 *
 * `menuRenderFn` returns a PLAIN element, so the list renders exactly where
 * this plugin sits — inside `.occ-root` — and is positioned by CSS above the
 * field. The plugin's positioning anchor is parked under the same root
 * (`parent`) and neutralised by `.occ-typeahead-anchor`; nothing is portalled
 * to `document.body`. Mounting is a conditional render: instant, no geometry
 * tween (M1).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { useQueryClient } from '@tanstack/react-query';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  type ElementNode,
  type LexicalNode,
  type TextNode,
} from 'lexical';
import { commitIdentifierFind } from '@/lib/search/commit-identifier-find';
import type { ShippedOrder } from '@/types/orders';
import {
  classifyComposerToken,
  isIdentifierPrefix,
  type ComposerTokenClass,
} from '@/lib/composer/grammar';
import { resolveAutoCommitHit, type ComposerResolveFn } from '@/lib/composer/resolve';
import { searchComposerActions, type ComposerAction } from '@/lib/composer/actions';
import type { ComposerCommit } from '@/lib/composer/commit';
import { getOrderPlatformLabel } from '@/utils/order-platform';
import type { FindFieldSource } from '@/lib/keyboard/find-field-scan';
import {
  $createEntityChipNode,
  $isEntityChipNode,
  type EntityChipNode,
  type EntityChipPayload,
} from './EntityChipNode';

/* ── the imperative handle (scanner + send button) ───────────────────── */

export interface OmniComposerHandle {
  /** The scan path: resolve the token — hit chips + hydrates, miss lands the
   *  token as plain text so the typeahead can see it. */
  commitToken: (token: string, source: FindFieldSource) => void;
  /** Remove the claimed burst's characters the wedge typed into the field. */
  stripTrailingText: (value: string) => void;
  appendPlain: (text: string) => void;
  focus: () => void;
  /** The send button — same arbitration as pressing Enter. */
  submit: () => void;
}

/* ── menu options ────────────────────────────────────────────────────── */

interface OrderSearchHit {
  readonly id: number;
  readonly entityType: string;
  readonly title: string;
  readonly subtitle: string;
}

class OrderOption extends MenuOption {
  readonly hit: OrderSearchHit;
  constructor(hit: OrderSearchHit) {
    super(`order:${hit.id}`);
    this.hit = hit;
  }
}

class ActionOption extends MenuOption {
  readonly action: ComposerAction;
  constructor(action: ComposerAction) {
    super(`action:${action.key}`);
    this.action = action;
  }
}

type OccOption = OrderOption | ActionOption;

/* ── editor-state helpers ────────────────────────────────────────────── */

/** The tail paragraph to append into — never a decorator, always an element
 *  (after `clear()` the root is empty, so make the paragraph first). */
function $tailParagraph(): ElementNode {
  const root = $getRoot();
  const last = root.getLastChild();
  if ($isElementNode(last)) return last;
  const p = $createParagraphNode();
  root.append(p);
  return p;
}

function $appendPlain(text: string): void {
  const p = $tailParagraph();
  const node = $createTextNode(text);
  p.append(node);
  node.select();
}

function $appendChip(payload: EntityChipPayload): void {
  const p = $tailParagraph();
  const chip = $createEntityChipNode(payload);
  const space = $createTextNode(' ');
  p.append(chip, space);
  space.select();
}

/** Replace the trailing `raw` characters with a chip. Returns false (and does
 *  nothing) when the text no longer ends with the token — the operator kept
 *  typing while the resolve was in flight, so the commit is stale. */
function $replaceTrailingToken(raw: string, payload: EntityChipPayload): boolean {
  const root = $getRoot();
  const last = root.getLastDescendant();
  if (!$isTextNode(last)) return false;
  const text = last.getTextContent();
  if (!text.endsWith(raw)) return false;
  const chip = $createEntityChipNode(payload);
  const offset = text.length - raw.length;
  if (offset === 0) {
    last.replace(chip);
  } else {
    const [, tokenNode] = last.splitText(offset);
    tokenNode.replace(chip);
  }
  const space = $createTextNode(' ');
  chip.insertAfter(space);
  space.select();
  return true;
}

/** Remove the trailing `value` characters (across text nodes). */
function $removeTrailingText(value: string): void {
  let remaining = value;
  const root = $getRoot();
  while (remaining.length > 0) {
    const last = root.getLastDescendant();
    if (!$isTextNode(last)) return;
    const text = last.getTextContent();
    if (text.length <= remaining.length) {
      if (!remaining.endsWith(text)) return;
      remaining = remaining.slice(0, remaining.length - text.length);
      last.remove();
    } else {
      if (!text.endsWith(remaining)) return;
      last.setTextContent(text.slice(0, text.length - remaining.length));
      last.select();
      return;
    }
  }
}

/** Text the operator typed, chips excluded — what "send" actually sends. */
function $proseText(): string {
  const parts: string[] = [];
  const walk = (node: LexicalNode): void => {
    if ($isEntityChipNode(node)) return;
    if ($isTextNode(node)) {
      parts.push(node.getTextContent());
      return;
    }
    if ($isLineBreakNode(node)) {
      parts.push('\n');
      return;
    }
    if ($isElementNode(node)) {
      for (const child of node.getChildren()) walk(child);
      parts.push('\n');
    }
  };
  for (const child of $getRoot().getChildren()) walk(child);
  return parts.join('').replace(/\n+$/, '');
}

function $hasChips(): boolean {
  const scan = (node: LexicalNode): boolean => {
    if ($isEntityChipNode(node)) return true;
    if ($isElementNode(node)) return node.getChildren().some(scan);
    return false;
  };
  return $getRoot().getChildren().some(scan);
}

function $clearEditor(): void {
  const root = $getRoot();
  root.clear();
  const p = $createParagraphNode();
  root.append(p);
  p.select();
}

/* ── trigger matching ────────────────────────────────────────────────── */

/**
 * The trailing token: an optional sigil plus alnum-and-dash characters, or a
 * lone sigil. A hand-rolled match because the stock trigger helper's
 * punctuation class includes `-` and would cut every marketplace id short.
 */
const TRAILING_TOKEN = /(^|\s)((?:[#@/])?[A-Za-z0-9][A-Za-z0-9-]*|[#@/])$/;

const SEARCH_DEBOUNCE_MS = 300;

function chipPayloadFromOrder(order: ShippedOrder): EntityChipPayload {
  return {
    entity: 'order',
    pk: order.id,
    token: order.order_id,
    platform: getOrderPlatformLabel(order.order_id, order.account_source),
    title: order.product_title ?? null,
  };
}

export interface ComposerGrammarPluginProps {
  onCommit: (commit: ComposerCommit) => void;
  onDraftChange?: (hasProse: boolean) => void;
  handleRef?: React.MutableRefObject<OmniComposerHandle | null>;
  /** `useFindFieldScan`'s ref callback — attached to the contenteditable. */
  attachScanCapture?: (el: HTMLElement | null) => void;
  /** The `.occ-root` element — the menu's anchor parent (I6). */
  anchorParent: HTMLElement | null;
}

export function ComposerGrammarPlugin({
  onCommit,
  onDraftChange,
  handleRef,
  attachScanCapture,
  anchorParent,
}: ComposerGrammarPluginProps) {
  const [editor] = useLexicalComposerContext();
  const queryClient = useQueryClient();

  const [options, setOptions] = useState<OccOption[]>([]);
  const [queryString, setQueryString] = useState<string | null>(null);

  const kindRef = useRef<ComposerTokenClass | null>(null);
  const menuOpenRef = useRef(false);
  const optionsRef = useRef<OccOption[]>([]);
  optionsRef.current = options;
  const querySeq = useRef(0);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  /** The one exact resolver — `commitIdentifierFind` seeds the TanStack
   *  search-order cache, so a chip's row is warm for whatever reads it next. */
  const resolveToken: ComposerResolveFn<ShippedOrder> = useCallback(
    async (token) => {
      try {
        const result = await commitIdentifierFind(queryClient, token);
        if (result.kind === 'navigate') return { kind: 'hit', order: result.order };
        return { kind: 'miss' };
      } catch {
        return { kind: 'miss' };
      }
    },
    [queryClient],
  );

  /* ── the Enter arbitration (spec §Enter) ───────────────────────────── */

  const enterCommitToken = useCallback(
    (cls: ComposerTokenClass, source: FindFieldSource) => {
      void (async () => {
        const outcome = await resolveToken(cls.query);
        if (outcome.kind === 'hit') {
          let committed = false;
          editor.update(() => {
            committed = $replaceTrailingToken(cls.raw, chipPayloadFromOrder(outcome.order));
          });
          if (committed) {
            onCommitRef.current({
              kind: 'order',
              order: outcome.order,
              token: outcome.order.order_id,
              source,
            });
          }
        } else {
          editor.update(() => {
            $removeTrailingText(cls.raw);
          });
          onCommitRef.current({ kind: 'miss', token: cls.query, source });
        }
      })();
    },
    [editor, resolveToken],
  );

  useEffect(
    () =>
      editor.registerCommand<KeyboardEvent | null>(
        KEY_ENTER_COMMAND,
        (event) => {
          // The open typeahead owns Enter — but only while it has rows to own.
          if (menuOpenRef.current && optionsRef.current.length > 0) return false;
          if (event?.shiftKey) return false; // newline
          event?.preventDefault();
          const { prose, hasChips } = editor
            .getEditorState()
            .read(() => ({ prose: $proseText().trim(), hasChips: $hasChips() }));
          const cls = prose && !/\s/.test(prose) ? classifyComposerToken(prose) : null;
          if (cls && cls.kind === 'order' && cls.query && !isIdentifierPrefix(cls.query)) {
            // An identifier alone is a find, never a chat line — the scanner
            // path's terminator lands here when the burst went unclaimed.
            enterCommitToken(cls, 'human');
            return true;
          }
          if (!prose && !hasChips) return true;
          editor.update(() => {
            $clearEditor();
          });
          if (prose) onCommitRef.current({ kind: 'prose', text: prose });
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor, enterCommitToken],
  );

  /* ── the scan hand-off + the imperative handle ─────────────────────── */

  const scanCommitToken = useCallback(
    (token: string, source: FindFieldSource) => {
      const cls = classifyComposerToken(token.trim());
      if (!cls || cls.kind !== 'order' || !cls.query || isIdentifierPrefix(cls.query)) {
        editor.update(() => {
          $appendPlain(token);
        });
        return;
      }
      void (async () => {
        const outcome = await resolveToken(cls.query);
        if (outcome.kind === 'hit') {
          editor.update(() => {
            $appendChip(chipPayloadFromOrder(outcome.order));
          });
          onCommitRef.current({
            kind: 'order',
            order: outcome.order,
            token: outcome.order.order_id,
            source,
          });
        } else {
          // Miss: the token LANDS as text, so the typeahead can see it.
          editor.update(() => {
            $appendPlain(token);
          });
        }
      })();
    },
    [editor, resolveToken],
  );

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = {
      commitToken: scanCommitToken,
      stripTrailingText: (value) =>
        editor.update(() => {
          $removeTrailingText(value);
        }),
      appendPlain: (text) =>
        editor.update(() => {
          $appendPlain(text);
        }),
      focus: () => editor.focus(),
      submit: () => {
        editor.focus();
        editor.dispatchCommand(KEY_ENTER_COMMAND, null);
      },
    };
    return () => {
      handleRef.current = null;
    };
  }, [editor, handleRef, scanCommitToken]);

  /* ── wedge capture on the contenteditable + draft state + autofocus ── */

  useEffect(() => {
    if (!attachScanCapture) return;
    const teardown = editor.registerRootListener((root) => {
      attachScanCapture(root);
    });
    return () => {
      teardown();
      attachScanCapture(null);
    };
  }, [editor, attachScanCapture]);

  useEffect(() => {
    if (!onDraftChange) return;
    return editor.registerUpdateListener(({ editorState }) => {
      onDraftChange(editorState.read(() => $proseText().trim().length > 0));
    });
  }, [editor, onDraftChange]);

  useEffect(() => {
    editor.focus();
  }, [editor]);

  /* ── the typeahead + deterministic auto-commit ─────────────────────── */

  const triggerFn = useCallback((text: string) => {
    const m = TRAILING_TOKEN.exec(text);
    if (!m) {
      kindRef.current = null;
      return null;
    }
    const raw = m[2];
    const cls = classifyComposerToken(raw);
    if (!cls) {
      kindRef.current = null;
      return null;
    }
    kindRef.current = cls;
    return {
      leadOffset: m.index + m[1].length,
      matchingString: cls.query,
      replaceableString: raw,
    };
  }, []);

  useEffect(() => {
    const cls = kindRef.current;
    const seq = ++querySeq.current;
    if (queryString === null || !cls) {
      setOptions([]);
      return;
    }
    if (cls.kind === 'action') {
      setOptions(searchComposerActions(queryString).map((a) => new ActionOption(a)));
      return;
    }
    if (cls.kind === 'user' || !queryString) {
      // `@` is reserved — classified, no directory behind it yet.
      setOptions([]);
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        // Typeahead rows — the ONE orders table via tenant-scoped search.
        try {
          const res = await fetch(
            `/api/global-search?q=${encodeURIComponent(queryString)}&limit=8`,
            { credentials: 'include' },
          );
          const body = res.ok ? ((await res.json()) as { rows?: OrderSearchHit[] }) : null;
          const rows = Array.isArray(body?.rows) ? body.rows : [];
          if (querySeq.current === seq) {
            setOptions(
              rows.filter((r) => r.entityType === 'order').map((h) => new OrderOption(h)),
            );
          }
        } catch {
          if (querySeq.current === seq) setOptions([]);
        }
        // Deterministic auto-commit: complete identifier, exactly one row.
        // (`resolveAutoCommitHit` refuses prefixes before any fetch; the
        // trailing-token replace refuses stale text after it.)
        const order = await resolveAutoCommitHit(cls.raw, resolveToken);
        if (order && querySeq.current === seq) {
          let committed = false;
          editor.update(() => {
            committed = $replaceTrailingToken(cls.raw, chipPayloadFromOrder(order));
          });
          if (committed) {
            onCommitRef.current({
              kind: 'order',
              order,
              token: order.order_id,
              source: 'human',
            });
          }
        }
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [editor, queryString, resolveToken]);

  const onSelectOption = useCallback(
    (option: OccOption, nodeToRemove: TextNode | null, closeMenu: () => void) => {
      if (option instanceof ActionOption) {
        editor.update(() => {
          nodeToRemove?.remove();
        });
        onCommitRef.current({ kind: 'action', action: option.action });
        closeMenu();
        return;
      }
      closeMenu();
      void (async () => {
        // Resolve the picked row through the same exact waist (by pk).
        const outcome = await resolveToken(String(option.hit.id));
        if (outcome.kind !== 'hit') return;
        editor.update(() => {
          const payload = chipPayloadFromOrder(outcome.order);
          if (nodeToRemove && nodeToRemove.isAttached()) {
            const chip = nodeToRemove.replace<EntityChipNode>($createEntityChipNode(payload));
            const space = $createTextNode(' ');
            chip.insertAfter(space);
            space.select();
          } else {
            $appendChip(payload);
          }
        });
        onCommitRef.current({
          kind: 'order',
          order: outcome.order,
          token: outcome.order.order_id,
          source: 'human',
        });
      })();
    },
    [editor, resolveToken],
  );

  return (
    <LexicalTypeaheadMenuPlugin<OccOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      options={options}
      triggerFn={triggerFn}
      onOpen={() => {
        menuOpenRef.current = true;
      }}
      onClose={() => {
        menuOpenRef.current = false;
      }}
      parent={anchorParent ?? undefined}
      anchorClassName="occ-typeahead-anchor"
      menuRenderFn={(anchorRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) =>
        options.length === 0 ? null : (
          <ul className="occ-typeahead" role="listbox" aria-label="Omni-command results">
            {options.map((option, i) => (
              <li
                key={option.key}
                role="option"
                aria-selected={selectedIndex === i}
                className={`occ-typeahead-item${selectedIndex === i ? ' selected' : ''}`}
                ref={(el) => option.setRefElement(el)}
                onMouseEnter={() => setHighlightedIndex(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOptionAndCleanUp(option);
                }}
              >
                <span className="occ-typeahead-title">
                  {option instanceof ActionOption ? option.action.title : option.hit.title}
                </span>
                <span className="occ-typeahead-meta">
                  {option instanceof ActionOption ? option.action.meta : option.hit.subtitle}
                </span>
                {selectedIndex === i ? <span className="occ-typeahead-kbd">↵</span> : null}
              </li>
            ))}
          </ul>
        )
      }
    />
  );
}
