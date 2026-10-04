'use client';

/**
 * One task **Doc**, open: a resizable Write | Preview split, a toolbar for the
 * live parts, and a comment rail. Lives in the same right-pane slide-over as
 * the Brief's reader (`RightPaneOverlay`, remembered width, ⤢ full-screen
 * latch) because a document needs more room than the record's rail.
 *
 *   Write    markdown; ⌘S or leaving the field saves (PATCH guarded by the
 *            `updatedAt` it loaded — a stale save is refused, the draft stays)
 *   Preview  the shared `MarkdownRenderer live="desk"`: reference chips,
 *            ```tasks``` blocks with each task's Definition of Done, diagrams
 *   Comments select text in either pane → Comment; each comment keeps the
 *            quoted passage and the heading it sits under (P6: comments anchor
 *            to the document, attributed); resolve / reopen; the author removes
 *
 * A linked plan file (`source: repo`) is read-only here — it is edited in the
 * codebase.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, Maximize2, MessageSquare, Minimize2, RotateCcw, Trash2, X } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { StaffBadge } from '@/design-system/components/StaffBadge';
import { useHorizontalEdgeResize } from '@/design-system/hooks/useHorizontalEdgeResize';
import { Button, IconButton } from '@/design-system/primitives';
import { EVIDENCE_CONTROL_CLASS } from '@/design-system/components/record-ledger/RecordEvidence';
import { headingSlug } from '@/lib/tasks/doc-live';
import { DOC_TOOLBAR_INSERTS, applyDocInsert } from '@/lib/tasks/doc-templates';
import { TASK_DOC_COMMENT_BODY_MAX, type TaskDocComment } from '@/lib/tasks/task-document-comments-shared';
import { TASK_DOCUMENT_CONTENT_MAX, TASK_DOCUMENT_REFUSAL_COPY, TASK_DOCUMENT_TITLE_MAX } from '@/lib/tasks/task-documents-shared';
import { useSaveTaskDocument, useTaskDocComments, useTaskDocument } from '@/lib/tasks/use-task-workspace';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

const HEADER_ICON = 'rounded-md p-1.5 text-text-muted hover:bg-surface-strong hover:text-text-default';
const QUOTE_MAX = 500;

/** The heading a passage sits under — the comment's scroll target in the preview. */
function headingSlugAt(markdown: string, quote: string): string | null {
  const at = markdown.indexOf(quote);
  if (at < 0) return null;
  const before = markdown.slice(0, at).split('\n');
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const heading = /^#{1,6}\s+(.*)$/.exec(before[i]);
    if (heading) return headingSlug(heading[1]) || null;
  }
  return null;
}

function timeFace(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function TaskDocumentEditor({
  taskId,
  docId,
  viewerStaffId,
  onClose,
}: {
  taskId: number;
  docId: number | null;
  /** The signed-in staffer — only a comment's author may remove it. */
  viewerStaffId: number | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const open = docId != null;
  const { data: doc, isLoading, error } = useTaskDocument(taskId, docId);
  const save = useSaveTaskDocument(taskId);
  const comments = useTaskDocComments(taskId, docId);

  const [fullscreen, setFullscreen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [quote, setQuote] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [composing, setComposing] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // A different doc (or a close) starts clean.
  useEffect(() => {
    setDraft(null);
    setTitleDraft(null);
    setConflict(false);
    setQuote('');
    setCommentBody('');
    setComposing(false);
    if (!open) setFullscreen(false);
  }, [docId, open]);

  const editable = doc?.source === 'upload';
  const saved = doc?.content ?? '';
  const text = draft ?? saved;
  const dirty = draft !== null && draft !== saved;
  const titleDirty = titleDraft !== null && titleDraft.trim() !== '' && titleDraft.trim() !== doc?.title;

  const writePane = useHorizontalEdgeResize({
    storageKey: 'task-doc-write-width',
    defaultWidth: 480,
    minWidth: 280,
    maxWidthPad: 360,
    edge: 'trailing',
    label: 'Resize the writing pane',
    testId: 'task-doc-split-resize',
  });

  const persist = useCallback(async () => {
    if (!doc || !editable || save.isPending || conflict) return;
    if (!dirty && !titleDirty) return;
    try {
      await save.mutateAsync({
        docId: doc.id,
        body: {
          ...(dirty ? { content: draft ?? '' } : {}),
          ...(titleDirty ? { title: titleDraft!.trim() } : {}),
          expectedUpdatedAt: doc.updatedAt,
        },
      });
      setDraft(null);
      setTitleDraft(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save the document.';
      if (message === TASK_DOCUMENT_REFUSAL_COPY.stale_document) setConflict(true);
      else toast.error(message);
    }
  }, [doc, editable, save, conflict, dirty, titleDirty, draft, titleDraft]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void persist();
    }
  };

  /** The passage the staffer has selected in either pane, for the next comment. */
  const captureSelection = () => {
    const area = textRef.current;
    let picked = '';
    if (area && document.activeElement === area && area.selectionEnd > area.selectionStart) {
      picked = area.value.slice(area.selectionStart, area.selectionEnd);
    } else {
      const selection = window.getSelection();
      if (selection && previewRef.current && selection.rangeCount > 0 && previewRef.current.contains(selection.anchorNode)) {
        picked = selection.toString();
      }
    }
    const clean = picked.replace(/\s+/g, ' ').trim().slice(0, QUOTE_MAX);
    if (clean) setQuote(clean);
  };

  const startComment = () => {
    captureSelection();
    setRailOpen(true);
    setComposing(true);
  };

  const postComment = async () => {
    const body = commentBody.trim();
    if (!body) return;
    await comments.post.mutateAsync({
      body,
      quote: quote || null,
      headingSlug: quote ? headingSlugAt(text, quote) : null,
      clientEventId: `task-doc-comment:${docId}:${Date.now()}`,
    });
    setCommentBody('');
    setQuote('');
    setComposing(false);
  };

  const jumpTo = (comment: TaskDocComment) => {
    if (!comment.headingSlug) return;
    previewRef.current?.querySelector(`#${CSS.escape(comment.headingSlug)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const [openComments, resolvedComments] = useMemo(
    () => [comments.comments.filter((c) => !c.resolvedAt), comments.comments.filter((c) => c.resolvedAt)],
    [comments.comments],
  );

  const status = conflict
    ? null
    : save.isPending
      ? 'Saving…'
      : dirty || titleDirty
        ? 'Unsaved · ⌘S saves'
        : doc
          ? `Saved ${timeFace(doc.updatedAt)}`
          : '';

  const latchLabel = fullscreen ? 'Exit full screen' : 'Full screen';

  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="right"
      anchor={fullscreen ? 'viewport' : 'pane'}
      width={1100}
      minWidth={640}
      resizable={!fullscreen}
      storageKey="task-doc-editor-width"
      aria-labelledby={titleId}
      className={cn('min-w-0', fullscreen && '!w-full border-l-0')}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border-hairline bg-surface-canvas px-4 py-2" onKeyDown={onKeyDown}>
        <h2 id={titleId} className="sr-only">
          {doc?.title ?? 'Document'}
        </h2>
        {editable ? (
          <input
            aria-label="Document title"
            value={titleDraft ?? doc?.title ?? ''}
            maxLength={TASK_DOCUMENT_TITLE_MAX}
            onChange={(event) => setTitleDraft(event.target.value)}
            onBlur={() => void persist()}
            className={cn(EVIDENCE_CONTROL_CLASS, 'h-8 min-w-0 flex-1 font-semibold')}
            data-testid="task-doc-title"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-role-data font-semibold text-text-default">{doc?.title ?? 'Document'}</span>
        )}
        <span role="status" aria-live="polite" className="shrink-0 text-role-caption text-text-muted" data-testid="task-doc-save-state">
          {status}
        </span>
        <Button
          variant={railOpen ? 'secondary' : 'ghost'}
          size="sm"
          icon={<MessageSquare className="h-3.5 w-3.5" />}
          onMouseDown={(event) => event.preventDefault()}
          onClick={startComment}
          data-testid="task-doc-comment"
        >
          Comment{openComments.length ? ` · ${openComments.length}` : ''}
        </Button>
        <HoverTooltip label={latchLabel} asChild>
          <IconButton
            ariaLabel={latchLabel}
            aria-pressed={fullscreen}
            icon={fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            onClick={() => setFullscreen((value) => !value)}
            className={HEADER_ICON}
          />
        </HoverTooltip>
        <HoverTooltip label="Close" asChild>
          <IconButton ariaLabel="Close the document" icon={<X className="h-4 w-4" />} onClick={onClose} className={HEADER_ICON} />
        </HoverTooltip>
      </header>

      {conflict ? (
        <div role="alert" className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-hairline bg-surface-sunken px-4 py-2 text-role-caption text-text-default" data-testid="task-doc-conflict">
          <span className="mr-auto">{TASK_DOCUMENT_REFUSAL_COPY.stale_document}</span>
          <Button variant="secondary" size="sm" onClick={() => void navigator.clipboard.writeText(text).then(() => toast.success('Your text is on the clipboard.'))}>
            Copy my text
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<RotateCcw className="h-3.5 w-3.5" />}
            onClick={() => {
              setDraft(null);
              setTitleDraft(null);
              setConflict(false);
            }}
          >
            Load their version
          </Button>
        </div>
      ) : null}

      {editable ? (
        <div className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-border-hairline px-3 py-1" role="toolbar" aria-label="Insert">
          {DOC_TOOLBAR_INSERTS.map((insert) => (
            <Button
              key={insert.id}
              variant="ghost"
              size="sm"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const area = textRef.current;
                const next = applyDocInsert(text, area?.selectionStart ?? text.length, area?.selectionEnd ?? text.length, insert);
                setDraft(next.text);
                requestAnimationFrame(() => {
                  area?.focus();
                  area?.setSelectionRange(next.caret, next.caret);
                });
              }}
              data-testid={`task-doc-insert-${insert.id}`}
            >
              {insert.label}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {isLoading ? <p className="p-4 text-role-caption text-text-muted">Opening the document…</p> : null}
        {error ? (
          <p role="alert" className="p-4 text-role-caption text-text-default">
            {error instanceof Error ? error.message : 'Could not open the document.'}
          </p>
        ) : null}
        {doc && editable ? (
          <div className="relative flex shrink-0 flex-col border-r border-border-hairline" style={{ width: writePane.width }}>
            <label htmlFor={`${titleId}-text`} className="sr-only">
              Document (markdown)
            </label>
            <textarea
              id={`${titleId}-text`}
              ref={textRef}
              value={text}
              maxLength={TASK_DOCUMENT_CONTENT_MAX}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void persist()}
              onKeyDown={onKeyDown}
              spellCheck
              className="min-h-0 flex-1 resize-none bg-surface-card px-4 py-3 font-mono text-role-caption leading-6 text-text-default outline-none"
              data-testid="task-doc-input"
            />
            <HorizontalEdgeResizeHandle
              edgeHandleProps={writePane.edgeHandleProps}
              isDragging={writePane.isDragging}
              edge="trailing"
              tooltipLabel="Resize"
            />
          </div>
        ) : null}
        {doc ? (
          <div ref={previewRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain" data-testid="task-doc-preview">
            <article className="mx-auto w-full max-w-[72ch] px-6 py-5">
              {doc.content == null ? (
                <p className="text-role-caption text-text-muted">This plan file no longer exists in the codebase.</p>
              ) : text.trim() ? (
                <MarkdownRenderer content={text} live="desk" />
              ) : (
                <p className="text-role-caption text-text-muted">Nothing written yet.</p>
              )}
            </article>
          </div>
        ) : null}
        {doc && railOpen ? (
          <aside aria-label="Comments" className="flex w-72 shrink-0 flex-col border-l border-border-hairline bg-surface-canvas" data-testid="task-doc-comments">
            <div className="flex items-center gap-2 border-b border-border-hairline px-3 py-2">
              <span className="flex-1 text-role-micro font-semibold text-text-muted">Comments</span>
              <IconButton ariaLabel="Hide comments" icon={<X className="h-3.5 w-3.5" />} onClick={() => setRailOpen(false)} className={HEADER_ICON} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {composing ? (
                <form
                  className="mb-3 flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void postComment();
                  }}
                >
                  {quote ? (
                    <blockquote className="border-l-2 border-border-default pl-2 text-role-caption italic text-text-muted" data-testid="task-doc-comment-quote">
                      {quote}
                    </blockquote>
                  ) : (
                    <p className="text-role-micro text-text-muted">Select text in the document to quote it.</p>
                  )}
                  <textarea
                    aria-label="Comment"
                    value={commentBody}
                    maxLength={TASK_DOC_COMMENT_BODY_MAX}
                    rows={3}
                    autoFocus
                    onChange={(event) => setCommentBody(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        void postComment();
                      }
                    }}
                    className={cn(EVIDENCE_CONTROL_CLASS, 'w-full resize-y py-1.5')}
                    data-testid="task-doc-comment-input"
                  />
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" type="button" onClick={() => setComposing(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" type="submit" disabled={!commentBody.trim()} loading={comments.post.isPending} data-testid="task-doc-comment-post">
                      Comment
                    </Button>
                  </div>
                </form>
              ) : null}
              {comments.loading ? <p className="text-role-caption text-text-muted">Loading comments…</p> : null}
              {!comments.loading && openComments.length === 0 && !composing ? (
                <p className="text-role-caption text-text-muted">No open comments. Select text, then Comment.</p>
              ) : null}
              <ul className="flex flex-col gap-2">
                {openComments.map((comment) => (
                  <CommentRow
                    key={comment.id}
                    comment={comment}
                    canRemove={comment.author?.id === viewerStaffId}
                    onJump={() => jumpTo(comment)}
                    onResolve={() => comments.resolve.mutate({ commentId: comment.id, resolved: true })}
                    onRemove={() => comments.remove.mutate(comment.id)}
                  />
                ))}
              </ul>
              {resolvedComments.length ? (
                <div className="mt-3">
                  <button
                    type="button"
                    className="text-role-micro font-semibold text-text-muted hover:text-text-default"
                    onClick={() => setShowResolved((value) => !value)}
                  >
                    {showResolved ? 'Hide' : 'Show'} resolved · {resolvedComments.length}
                  </button>
                  {showResolved ? (
                    <ul className="mt-2 flex flex-col gap-2 opacity-70">
                      {resolvedComments.map((comment) => (
                        <CommentRow
                          key={comment.id}
                          comment={comment}
                          canRemove={comment.author?.id === viewerStaffId}
                          onJump={() => jumpTo(comment)}
                          onResolve={() => comments.resolve.mutate({ commentId: comment.id, resolved: false })}
                          onRemove={() => comments.remove.mutate(comment.id)}
                        />
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </RightPaneOverlay>
  );
}

function CommentRow({
  comment,
  canRemove,
  onJump,
  onResolve,
  onRemove,
}: {
  comment: TaskDocComment;
  canRemove: boolean;
  onJump: () => void;
  onResolve: () => void;
  onRemove: () => void;
}) {
  const resolved = comment.resolvedAt != null;
  return (
    <li className="rounded-mode border border-border-hairline bg-surface-card p-2" data-testid="task-doc-comment-row">
      <div className="flex items-center gap-1.5">
        {comment.author ? <StaffAvatar staffId={comment.author.id} name={comment.author.name} size="xs" /> : null}
        <StaffBadge staffId={comment.author?.id} name={comment.author?.name ?? 'System'} className="min-w-0 truncate text-role-caption font-semibold" />
        <span className="ml-auto shrink-0 text-role-micro text-text-muted">{timeFace(comment.createdAt)}</span>
      </div>
      {comment.quote ? (
        // ds-raw-button: the quote is the door back to its passage
        <button
          type="button"
          onClick={onJump}
          className="mt-1 block w-full border-l-2 border-border-default pl-2 text-left text-role-caption italic text-text-muted hover:text-text-default"
        >
          {comment.quote}
        </button>
      ) : null}
      <p className="mt-1 whitespace-pre-wrap text-role-caption text-text-default">{comment.body}</p>
      <div className="mt-1 flex items-center gap-1">
        <Button variant="ghost" size="sm" icon={resolved ? <RotateCcw className="h-3 w-3" /> : <Check className="h-3 w-3" />} onClick={onResolve}>
          {resolved ? 'Reopen' : 'Resolve'}
        </Button>
        {canRemove ? (
          <Button variant="ghost" size="sm" icon={<Trash2 className="h-3 w-3" />} onClick={onRemove} ariaLabel="Remove comment">
            Remove
          </Button>
        ) : null}
      </div>
    </li>
  );
}
