'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import CodeBlock from '@/components/ai/CodeBlock';

/**
 * Renders AI response markdown with correct bold, italic, lists, code,
 * and table formatting for employee-facing chat. Fenced code blocks are
 * syntax-highlighted (rehype-highlight) and wrapped in CodeBlock chrome
 * (language label + copy). The light highlight.js theme lives in globals.css.
 *
 * Two faces of the ONE renderer:
 *  - `prose` (default): assistant replies — real heading scale (h1/h2/h3).
 *  - `bubble`: operator messages — no heading tags inside a chat bubble;
 *    every heading demotes to a semibold <p> so the bubble stays a flat
 *    paragraph flow.
 *
 * List hierarchy vocabulary (both faces): the outermost list is the PARENT
 * tier (filled disc/decimal marker, caption size); a list nested inside a
 * parent item is the CHILD tier (dash marker, extra indent, micro size,
 * muted body). Depth is tracked with context set by the nested ul/ol and is
 * capped — anything deeper than the child tier renders as a flat child row,
 * never a third rhythm.
 */

const ListDepthContext = createContext(0);

/** Display tiers: parent → child, and depth 3+ renders as a flat child. */
const MAX_LIST_DEPTH = 2;

type MarkdownVariant = 'prose' | 'bubble';

const isChildDepth = (depth: number) => Math.min(depth, MAX_LIST_DEPTH) >= MAX_LIST_DEPTH;

function UnorderedList({ children }: { children?: ReactNode }) {
  const depth = Math.min(useContext(ListDepthContext), MAX_LIST_DEPTH);
  return (
    <ListDepthContext.Provider value={Math.min(depth + 1, MAX_LIST_DEPTH)}>
      <ul
        className={
          depth === 0
            ? 'mb-2 ml-4 list-disc space-y-1 text-role-caption leading-6 text-text-default'
            : "mb-1 ml-4 list-['–'] space-y-0.5 leading-5 marker:text-text-faint"
        }
      >
        {children}
      </ul>
    </ListDepthContext.Provider>
  );
}

function OrderedList({ children }: { children?: ReactNode }) {
  const depth = Math.min(useContext(ListDepthContext), MAX_LIST_DEPTH);
  return (
    <ListDepthContext.Provider value={Math.min(depth + 1, MAX_LIST_DEPTH)}>
      <ol
        className={
          depth === 0
            ? 'mb-2 ml-4 list-decimal space-y-1 text-role-caption leading-6 text-text-default'
            : 'mb-1 ml-4 list-decimal space-y-0.5 leading-5 marker:text-text-faint'
        }
      >
        {children}
      </ol>
    </ListDepthContext.Provider>
  );
}

function ListItem({ children }: { children?: ReactNode }) {
  const child = isChildDepth(useContext(ListDepthContext));
  // [&>p]:mb-0 — a paragraph directly inside a list item is tight-list
  // wrapping from react-markdown, not a rhythm break; it must not inflate.
  return (
    <li
      className={
        child
          ? 'pl-1 text-role-micro text-text-muted [&>p]:mb-0'
          : 'pl-1 text-role-caption [&>p]:mb-0'
      }
    >
      {children}
    </li>
  );
}

function ProseH1({ children }: { children?: ReactNode }) {
  return <h1 className="mb-2 mt-4 text-base font-semibold text-text-default">{children}</h1>;
}

function ProseH2({ children }: { children?: ReactNode }) {
  return <h2 className="mb-2 mt-3 text-sm font-semibold text-text-default">{children}</h2>;
}

function ProseH3({ children }: { children?: ReactNode }) {
  return <h3 className="mb-1 mt-3 text-sm font-semibold text-text-default">{children}</h3>;
}

function BubbleHeading({ children }: { children?: ReactNode }) {
  return (
    <p className="mb-2 mt-3 text-role-caption font-semibold leading-6 text-text-default">
      <strong className="font-semibold text-text-default">{children}</strong>
    </p>
  );
}

export default function MarkdownRenderer({
  content,
  variant = 'prose',
}: {
  content: string;
  variant?: MarkdownVariant;
}) {
  const components = useMemo<Components>(() => {
    const bubble = variant === 'bubble';
    return {
      h1: bubble ? BubbleHeading : ProseH1,
      h2: bubble ? BubbleHeading : ProseH2,
      h3: bubble ? BubbleHeading : ProseH3,
      p: ({ children }: { children?: ReactNode }) => (
        <p className="mb-2 text-role-caption leading-6 text-text-default">{children}</p>
      ),
      strong: ({ children }: { children?: ReactNode }) => (
        <strong className="font-semibold text-text-default">{children}</strong>
      ),
      em: ({ children }: { children?: ReactNode }) => (
        <em className="italic text-text-muted">{children}</em>
      ),
      ul: UnorderedList,
      ol: OrderedList,
      li: ListItem,
      code: ({ className, children, node: _node, ...props }) => {
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
      pre: ({ children }: { children?: ReactNode }) => <>{children}</>,
      blockquote: ({ children }: { children?: ReactNode }) => (
        <blockquote className="mb-2 border-l-2 border-border-default pl-3 text-role-caption italic text-text-muted">
          {children}
        </blockquote>
      ),
      table: ({ children }: { children?: ReactNode }) => (
        <div className="mb-2 overflow-x-auto">
          <table className="w-full border-collapse border border-border-soft text-role-caption">{children}</table>
        </div>
      ),
      thead: ({ children }: { children?: ReactNode }) => (
        <thead className="bg-surface-canvas">{children}</thead>
      ),
      th: ({ children }: { children?: ReactNode }) => (
        <th className="border border-border-soft px-2 py-1.5 text-left font-semibold text-text-muted">{children}</th>
      ),
      td: ({ children }: { children?: ReactNode }) => (
        <td className="border border-border-soft px-2 py-1.5 text-text-default">{children}</td>
      ),
      hr: () => <hr className="my-3 border-border-soft" />,
      a: ({ href, children }: { href?: string; children?: ReactNode }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline underline-offset-2 hover:text-blue-800">
          {children}
        </a>
      ),
    };
  }, [variant]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
}
