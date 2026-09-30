'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import CodeBlock from '@/components/ui/CodeBlock';
import { Check } from '@/components/Icons';
import { cn } from '@/utils/_cn';

/** Renders markdown with correct bold, italic, lists, code and table formatting — AI chat answers, and the task desk's descriptions and… */
export default function MarkdownRenderer({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={{
        h1: ({ children }) => (
          <h1 className="mb-2 mt-4 text-base font-semibold text-text-default">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-2 mt-3 text-sm font-semibold text-text-default">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1 mt-3 text-sm font-semibold text-text-default">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="mb-2 text-role-caption leading-6 text-text-default">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-text-default">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-text-muted">{children}</em>
        ),
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
        // Read-only render: a crisp glyph, not a greyed-out disabled <input>.
        input: ({ type, checked }) =>
          type === 'checkbox' ? (
            <span
              role="img"
              aria-label={checked ? 'Done' : 'Not done'}
              className={cn(
                'absolute left-0.5 top-[5px] flex size-3.5 items-center justify-center rounded-sm border',
                checked ? 'border-text-default bg-text-default text-surface-card' : 'border-text-muted',
              )}
            >
              {checked ? <Check aria-hidden className="size-3" /> : null}
            </span>
          ) : null,
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
        thead: ({ children }) => (
          <thead className="bg-surface-canvas">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="border border-border-soft px-2 py-1.5 text-left font-semibold text-text-muted">{children}</th>
        ),
        td: ({ children }) => (
          <td className="border border-border-soft px-2 py-1.5 text-text-default">{children}</td>
        ),
        hr: () => <hr className="my-3 border-border-soft" />,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-text-accent underline underline-offset-2">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
