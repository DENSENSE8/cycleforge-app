'use client';

import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Loader2, Search, X } from '@/components/Icons';
import { FIELD_ACTION_CLASS } from './field-action';

export type SearchFieldTone =
  | 'blue'
  | 'orange'
  | 'red'
  | 'green'
  | 'emerald'
  | 'purple'
  | 'yellow'
  | 'neutral'
  | 'gray';

type SearchFieldSize = 'default' | 'compact';

const toneClassName: Record<SearchFieldTone, string> = {
  blue:    'border-blue-200 hover:border-blue-300 focus-within:border-blue-500 focus-within:hover:border-blue-500',
  orange:  'border-orange-200 hover:border-orange-300 focus-within:border-orange-500 focus-within:hover:border-orange-500',
  red:     'border-red-200 hover:border-red-300 focus-within:border-red-500 focus-within:hover:border-red-500',
  green:   'border-green-200 hover:border-green-300 focus-within:border-green-500 focus-within:hover:border-green-500',
  emerald: 'border-emerald-200 hover:border-emerald-300 focus-within:border-emerald-500 focus-within:hover:border-emerald-500',
  purple:  'border-purple-200 hover:border-purple-300 focus-within:border-purple-500 focus-within:hover:border-purple-500',
  yellow:  'border-amber-200 hover:border-amber-300 focus-within:border-amber-500 focus-within:hover:border-amber-500',
  neutral: 'border-border-default hover:border-border-emphasis focus-within:border-border-strong focus-within:hover:border-border-strong',
  gray:    'border-border-default hover:border-border-emphasis focus-within:border-border-strong focus-within:hover:border-border-strong',
};

const loaderToneClass: Record<SearchFieldTone, string> = {
  blue:    'text-blue-500',
  orange:  'text-orange-500',
  red:     'text-red-500',
  green:   'text-green-500',
  emerald: 'text-emerald-500',
  purple:  'text-purple-500',
  yellow:  'text-amber-500',
  neutral: 'text-text-soft',
  gray:    'text-text-muted',
};

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * Commit handler (Enter). Also fires after a native Cmd/Ctrl+V when the
   * pasted text is non-empty — paste is a commit, not a draft fill. Omit when
   * paste should only populate the field.
   */
  onSearch?: (value: string) => void;
  onClear?: () => void;
  /**
   * ArrowDown in the input hands focus to the result list the caller owns.
   *
   * Arrow keys are otherwise swallowed by the `<input>` (Enter is the only key
   * with a path — see `handleSubmit`), so an operator who has just typed a
   * query has to leave the keyboard and reach for the mouse to touch the first
   * row. Moving focus is NOT submitting: this never flushes the debounce and
   * never commits the draft, so the in-flight query the operator is still
   * refining is left exactly as it is.
   *
   * Omit it and ArrowDown stays untouched — the keydown is not prevented and
   * still bubbles, which is what a parent that already runs its own roving
   * listbox (DataTable's column-filter popover wraps the field in a keydown
   * host) depends on. Binding both would move focus twice on one press.
   */
  onNavigateResults?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  placeholder?: string;
  className?: string;
  tone?: SearchFieldTone;
  size?: SearchFieldSize;
  /**
   * Trailing loader while a query fetch is in flight. Only paints when the
   * field has a non-empty value — a background list refetch must not hijack an
   * empty open field's chrome.
   */
  isSearching?: boolean;
  rightElement?: ReactNode;
  leadingIcon?: ReactNode;
  /**
   * Hide the leading search glyph when a parent draws its own affordance
   * outside the field. Prefer the in-field glyph for scoped search chrome.
   */
  hideLeadingIcon?: boolean;
  /**
   * Makes the leading glyph a button. Header find uses this to open the
   * search-by picker; other fields omit it and keep a decorative glyph.
   */
  onLeadingAction?: () => void;
  leadingActionLabel?: string;
  leadingActionExpanded?: boolean;
  autoFocus?: boolean;
  /** Debounce delay in ms before onChange fires. Default 320ms. */
  debounceMs?: number;
  /**
   * Omit the field’s own bottom border so a parent can draw a single full-width rule
   * (e.g. sidebar scan strips).
   */
  hideUnderline?: boolean;
  /** Hide the clear (X) control when the field has a value. */
  hideClear?: boolean;
  /**
   * Stretch the input and trailing slot to the host row instead of the compact
   * `h-7` box. Workbench chrome / MasterNav find pass this so the field fills a
   * pinned 28px ops chrome host edge-to-edge.
   */
  fillHost?: boolean;
}

/**
 * SearchField — decoupled draft architecture.
 *
 * The input owns its own `draft` state so parent re-renders during async fetches
 * never disrupt the cursor position or erase typed characters. The `onChange`
 * prop is called only after the debounce window, preventing per-keystroke DB pings.
 *
 * Sync contract:
 *  - Parent clears `value` → draft resets immediately.
 *  - Parent sets non-empty `value` → draft syncs only while input is not focused.
 *  - Draft → parent: debounced, so a single DB query fires after typing pauses.
 *
 * Keyboard contract:
 *  - Enter → flush the debounce, commit, fire `onSearch`.
 *  - ArrowDown → `onNavigateResults` when supplied; focus only, no commit.
 *  - Every other key is the browser's, so the field never fights a parent
 *    that runs its own key handling above it.
 */
export function SearchField({
  value,
  onChange,
  onSearch,
  onClear,
  onNavigateResults,
  inputRef,
  placeholder = 'Search',
  className = '',
  tone = 'blue',
  size = 'compact',
  isSearching = false,
  rightElement,
  leadingIcon,
  hideLeadingIcon = false,
  onLeadingAction,
  leadingActionLabel = 'Change search type',
  leadingActionExpanded,
  autoFocus = false,
  debounceMs = 320,
  hideUnderline = false,
  hideClear = false,
  fillHost = false,
}: SearchFieldProps) {
  // Internal draft — avoid churn from async parent updates during typing.
  const [draft, setDraft] = useState(value);
  const committedRef = useRef(value);   // last value we sent to onChange
  const justClearedRef = useRef(false); // blocks stale parent value until clear propagates
  const isMountedRef = useRef(false);
  const debounceTimeoutRef = useRef<number | null>(null);
  const inputElementRef = useRef<HTMLInputElement | null>(null);

  const setInputRef = (node: HTMLInputElement | null) => {
    inputElementRef.current = node;
    if (!inputRef) return;
    if (typeof inputRef === 'function') {
      inputRef(node);
      return;
    }
    (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
  };

  // Sync contract:
  // - Always sync clears (parent requested reset).
  // - Sync non-empty external updates only when input is not focused.
  //   This preserves typing focus/cursor during async search, while still
  //   allowing external actions (e.g. selecting a recent search) to update text.
  useEffect(() => {
    if (!isMountedRef.current) {
      isMountedRef.current = true;
      setDraft(value);
      committedRef.current = value;
      return;
    }
    if (justClearedRef.current) {
      if (value === '') {
        justClearedRef.current = false;
      } else {
        // Parent still holds pre-clear value — keep local draft empty until it catches up.
        return;
      }
    }
    if (value === '' && committedRef.current !== '') {
      setDraft('');
      committedRef.current = '';
      return;
    }
    const isFocused = document.activeElement === inputElementRef.current;
    if (!isFocused && value !== draft) {
      setDraft(value);
      committedRef.current = value;
    }
  }, [draft, value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced propagation: fires onChange only after typing pauses.
  useEffect(() => {
    if (draft === committedRef.current) return;
    const id = window.setTimeout(() => {
      committedRef.current = draft;
      debounceTimeoutRef.current = null;
      onChange(draft);
    }, debounceMs);
    debounceTimeoutRef.current = id;
    return () => {
      window.clearTimeout(id);
      if (debounceTimeoutRef.current === id) debounceTimeoutRef.current = null;
    };
  }, [draft, debounceMs, onChange]);

  const hasValue = Boolean(draft.trim());
  const formRef = useRef<HTMLFormElement | null>(null);

  // Spinner means "this query is resolving" — never replace paste on an empty open field.
  const showSearchSpinner = isSearching && hasValue;
  // Pending = user has typed but debounce hasn't fired yet — show a subtle dot.
  const isPending = draft !== committedRef.current && !showSearchSpinner;

  const rowFill = fillHost ? 'h-full min-h-0' : 'h-7';
  const sizeClasses = size === 'compact'
    ? {
        field: hideUnderline ? '' : 'border-b pb-1',
        input: `${rowFill} text-sm`,
        rightSlot: rowFill,
      }
    : {
        field: hideUnderline ? '' : 'border-b-2',
        input: `${rowFill} text-sm`,
        rightSlot: rowFill,
      };

  const fieldGapClass = size === 'compact' ? 'gap-1' : 'gap-2';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Flush debounce immediately on Enter.
    if (debounceTimeoutRef.current != null) {
      window.clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    committedRef.current = draft;
    onChange(draft);
    onSearch?.(draft);
  };

  const handleClear = () => {
    if (debounceTimeoutRef.current != null) {
      window.clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    justClearedRef.current = true;
    setDraft('');
    committedRef.current = '';
    onChange('');
    onClear?.();
  };

  /** Flush draft + notify parent; when `commit`, also fire onSearch (paste / Enter). */
  const flushValue = (next: string, commit: boolean) => {
    if (debounceTimeoutRef.current != null) {
      window.clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    justClearedRef.current = false;
    setDraft(next);
    committedRef.current = next;
    onChange(next);
    if (commit) onSearch?.(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Focus handoff only. No flush, no commit — the operator is still refining
    // the query, and stealing the debounce here would fire a DB read for a
    // half-typed term the moment they reached for the first row.
    if (event.key !== 'ArrowDown' || !onNavigateResults) return;
    event.preventDefault(); // otherwise the caret jumps to end-of-input instead
    onNavigateResults();
  };

  const handleNativePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (!onSearch) return; // no commit handler — let the browser fill the draft
    const text = event.clipboardData?.getData('text') ?? '';
    const trimmed = text.trim();
    if (!trimmed) return;
    event.preventDefault();
    flushValue(trimmed, true);
  };

  const icon = leadingIcon || <Search className="h-4 w-4" />;

  const trailingControl = showSearchSpinner ? (
    <Loader2 className={`h-4 w-4 animate-spin ${loaderToneClass[tone]}`} />
  ) : isPending ? (
    <span className="flex h-4 w-4 items-center justify-center">
      <span
        className={`block h-[5px] w-[5px] rounded-full animate-pulse ${loaderToneClass[tone]} bg-current opacity-60`}
      />
    </span>
  ) : hasValue && !hideClear ? (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleClear}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-none text-text-faint transition-colors duration-100 ease-out hover:bg-surface-sunken hover:text-text-default active:scale-95"
      aria-label="Clear search"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  ) : (
    <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
  );

  return (
    <div className={`flex w-full min-w-0 items-center ${fillHost ? 'h-full' : ''} ${fieldGapClass} ${className}`.trim()}>
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className={`group flex min-w-0 flex-1 items-center ${fillHost ? 'h-full' : ''} ${fieldGapClass} transition-colors duration-150 ease-out ${sizeClasses.field} ${
          hideUnderline ? 'border-transparent' : toneClassName[tone]
        }`.trim()}
      >
        {hideLeadingIcon ? null : onLeadingAction ? (
          <button
            type="button"
            data-testid="search-field-leading-action"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onLeadingAction}
            className={FIELD_ACTION_CLASS}
            aria-label={leadingActionLabel}
            title={leadingActionLabel}
            aria-haspopup="listbox"
            aria-expanded={leadingActionExpanded}
          >
            {icon}
          </button>
        ) : (
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-text-faint transition-colors duration-100 ease-out group-focus-within:text-text-default">
            {icon}
          </span>
        )}

        <div
          data-search-field-well=""
          className={`relative min-w-0 flex-1 ${fillHost ? 'h-full' : ''}`}
        >
          <input
            ref={setInputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handleNativePaste}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className={`w-full border-0 bg-transparent px-0 font-semibold text-text-default outline-none placeholder:font-medium placeholder:text-text-faint ${sizeClasses.input}`.trim()}
          />
        </div>

        {/*
          Trailing row: spinner / pending / clear. There is no prefix, suffix or
          paste slot — the field holds TEXT and nothing else (Cmd/Ctrl+V still
          pastes, and still commits when `onSearch` is set). A control that
          narrows the list belongs beside the field, not inside it (teardown
          handoff § 2.1: two funnels, one job).
        */}
        <span
          className={`flex shrink-0 items-center gap-0.5 ${sizeClasses.rightSlot}`.trim()}
        >
          {trailingControl}
        </span>
      </form>

      {rightElement ? (
        <div className={`flex shrink-0 items-center ${sizeClasses.rightSlot}`}>{rightElement}</div>
      ) : null}
    </div>
  );
}
