'use client';

import { isValidElement, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import CodeBlock from '@/components/ui/CodeBlock';
import { headingSlug, type DocRefKind } from '@/lib/tasks/doc-live';
import { cn } from '@/utils/_cn';
import { ChecklistGlyph } from './markdown/ChecklistGlyph';
import { DocLiveScope, type DocSurface } from './markdown/doc-live-scope';
import { DocRefChip } from './markdown/DocRefChip';
import { MermaidBlock } from './markdown/MermaidBlock';
import { DOC_REF_TAG, remarkDocRefs } from './markdown/remark-doc-refs';
import { TasksQueryBlock } from './markdown/TasksQueryBlock';

/** Fenced languages that are data for a component, never source to highlight. */
const PLAIN_LANGUAGES = ['mermaid', 'tasks'];

/** A node's visible text — a heading's anchor slug, a fenced block's source. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return '';
}

/** In-app paths route through the app; only other origins open a new tab. */
function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const cls = 'text-text-accent underline underline-offset-2';
  if (href?.startsWith('/') && !href.startsWith('//')) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  if (href?.startsWith('#')) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
      {children}
    </a>
  );
}

/**
 * Renders markdown with correct bold, italic, lists, code and table formatting
 * — the task Brief, task documents, legal text. Fenced ```mermaid``` blocks
 * draw as diagrams / pie / bar charts everywhere.
 *
 * `live` (a task Brief or document) turns on the live parts (P6 — reference,
 * never copy): reference tokens become chips read from the record now
 * (`#T16034`, `@Thuc`, `RS-77`, `#9431`, `order:…`, `sku:…`), fenced
 * ```tasks``` blocks become live task rows with each task's Definition of
 * Done, and headings carry anchor ids. The value names the surface, so every
 * door opens on the app the reader is in.
 */
export default function MarkdownRenderer({ content, live }: { content: string; live?: DocSurface }) {
  const components = useMemo<Components>(() => {
    const heading = (Tag: 'h1' | 'h2' | 'h3', className: string) =>
      function Heading({ children }: { children?: ReactNode }) {
        return (
          <Tag id={live ? headingSlug(textOf(children)) || undefined : undefined} className={cn(className, live && 'scroll-mt-4')}>
            {children}
          </Tag>
        );
      };
    const base: Components = {
      h1: heading('h1', 'mb-2 mt-4 text-base font-semibold text-text-default'),
      h2: heading('h2', 'mb-2 mt-3 text-sm font-semibold text-text-default'),
      h3: heading('h3', 'mb-1 mt-3 text-sm font-semibold text-text-default'),
      p: ({ children }) => <p className="mb-2 text-role-caption leading-6 text-text-default">{children}</p>,
      strong: ({ children }) => <strong className="font-semibold text-text-default">{children}</strong>,
      em: ({ children }) => <em className="italic text-text-muted">{children}</em>,
      // GFM task lists (`- [ ]` / `- [x]`): remark-gfm tags the list
      // `contains-task-list` and each row `task-list-item`; those rows carry
      // their own checkbox, so they drop the disc and the indent.
      ul: ({ className, children }) => (
        <ul
          className={cn(
            'mb-2 space-y-1 text-role-caption leading-6 text-text-default',
            className?.includes('contains-task-list') ? 'ml-0 list-none' : 'ml-4 list-disc',
          )}
        >
          {children}
        </ul>
      ),
      ol: ({ className, children }) => (
        <ol
          className={cn(
            'mb-2 space-y-1 text-role-caption leading-6 text-text-default',
            className?.includes('contains-task-list') ? 'ml-0 list-none' : 'ml-4 list-decimal',
          )}
        >
          {children}
        </ol>
      ),
      // The checkbox hangs in the row's gutter so the text (bold, links)
      // keeps normal inline flow and wraps under itself, not under the box.
      li: ({ className, children }) =>
        className?.includes('task-list-item') ? (
          <li className="relative pl-6">{children}</li>
        ) : (
          <li className="pl-1">{children}</li>
        ),
      input: ({ type, checked }) => (type === 'checkbox' ? <ChecklistGlyph checked={Boolean(checked)} /> : null),
      img: ({ src, alt }) =>
        typeof src === 'string' && src ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary markdown URLs; next/image needs known hosts.
          <img src={src} alt={alt ?? ''} loading="lazy" className="my-2 block h-auto max-w-full rounded-mode border border-border-soft" />
        ) : null,
      code: ({ className, children, ...props }) => {
        const cls = className ?? '';
        // rehype-highlight tags fenced blocks with `hljs` + `language-x`;
        // inline code (single backticks) carries neither.
        const isBlock = /(^|\s)(hljs|language-)/.test(cls);
        if (isBlock) {
          const language = /language-([\w-]+)/.exec(cls)?.[1] ?? '';
          if (language === 'mermaid') return <MermaidBlock source={textOf(children).trim()} />;
          if (language === 'tasks' && live) return <TasksQueryBlock source={textOf(children).trim()} />;
          return <CodeBlock language={language}>{children}</CodeBlock>;
        }
        return (
          <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-role-caption font-mono text-text-default" {...props}>
            {children}
          </code>
        );
      },
      // CodeBlock renders its own <pre>; pass through so we don't double-wrap.
      pre: ({ children }) => <>{children}</>,
      blockquote: ({ children }) => (
        <blockquote className="mb-2 border-l-2 border-border-default pl-3 text-role-caption italic text-text-muted">
          {children}
        </blockquote>
      ),
      table: ({ children }) => (
        <div className="mb-2 overflow-x-auto">
          <table className="w-full border-collapse border border-border-soft text-role-caption">{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead className="bg-surface-canvas">{children}</thead>,
      th: ({ children }) => (
        <th className="border border-border-soft px-2 py-1.5 text-left font-semibold text-text-muted">{children}</th>
      ),
      td: ({ children }) => <td className="border border-border-soft px-2 py-1.5 text-text-default">{children}</td>,
      hr: () => <hr className="my-3 border-border-soft" />,
      a: ({ href, children }) => <MarkdownLink href={href}>{children}</MarkdownLink>,
    };
    if (!live) return base;
    // `docref` is the element remarkDocRefs emits; react-markdown passes its props through.
    const withRefs = {
      ...base,
      [DOC_REF_TAG]: ({ kind, value, children }: { kind: DocRefKind; value: string; children?: ReactNode }) => (
        <DocRefChip kind={kind} value={value}>
          {children}
        </DocRefChip>
      ),
    };
    return withRefs as Components;
  }, [live]);

  const markdown = (
    <ReactMarkdown
      remarkPlugins={live ? [remarkGfm, remarkDocRefs] : [remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true, plainText: PLAIN_LANGUAGES }]]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
  return live ? (
    <DocLiveScope content={content} surface={live}>
      {markdown}
    </DocLiveScope>
  ) : (
    markdown
  );
}
