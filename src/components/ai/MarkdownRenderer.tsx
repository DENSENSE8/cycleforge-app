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
 * Faces of the ONE renderer:
 *  - `prose` (default): house prose — real heading scale (h1/h2/h3), caption size.
 *  - `bubble`: operator messages in house chrome — no heading tags inside a
 *    chat bubble; every heading demotes to a semibold <p>.
 *  - `ai` / `ai-bubble`: the same two faces on the AI design system's prose
 *    scale (`@/design-system/ai`), for AI surfaces. Each block fades up as it
 *    lands (`ai-chunk-in`), so a streamed answer arrives chunk by chunk —
 *    blocks already on screen keep their DOM node and never replay it.
 *
 * List hierarchy vocabulary (every face): the outermost list is the PARENT
 * tier (filled disc/decimal marker); a list nested inside a parent item is the
 * CHILD tier (dash marker, extra indent, smaller muted body). Depth is tracked
 * with context set by the nested ul/ol and is capped — anything deeper than
 * the child tier renders as a flat child row, never a third rhythm.
 */

type MarkdownVariant = 'prose' | 'bubble' | 'ai' | 'ai-bubble';

interface MarkdownSkin {
  p: string;
  h1: string;
  h2: string;
  h3: string;
  /** Headings inside a bubble demote to this paragraph. */
  flatHeading: string;
  strong: string;
  em: string;
  ulParent: string;
  ulChild: string;
  olParent: string;
  olChild: string;
  liParent: string;
  liChild: string;
  code: string;
  blockquote: string;
  table: string;
  thead: string;
  th: string;
  td: string;
  hr: string;
  a: string;
}

const HOUSE_SKIN: MarkdownSkin = {
  p: 'mb-2 text-role-caption leading-6 text-text-default',
  h1: 'mb-2 mt-4 text-base font-semibold text-text-default',
  h2: 'mb-2 mt-3 text-sm font-semibold text-text-default',
  h3: 'mb-1 mt-3 text-sm font-semibold text-text-default',
  flatHeading: 'mb-2 mt-3 text-role-caption font-semibold leading-6 text-text-default',
  strong: 'font-semibold text-text-default',
  em: 'italic text-text-muted',
  ulParent: 'mb-2 ml-4 list-disc space-y-1 text-role-caption leading-6 text-text-default',
  ulChild: "mb-1 ml-4 list-['–'] space-y-0.5 leading-5 marker:text-text-faint",
  olParent: 'mb-2 ml-4 list-decimal space-y-1 text-role-caption leading-6 text-text-default',
  olChild: 'mb-1 ml-4 list-decimal space-y-0.5 leading-5 marker:text-text-faint',
  liParent: 'pl-1 text-role-caption [&>p]:mb-0',
  liChild: 'pl-1 text-role-micro text-text-muted [&>p]:mb-0',
  code: 'rounded bg-surface-sunken px-1.5 py-0.5 text-role-caption font-mono text-text-default',
  blockquote: 'mb-2 border-l-2 border-border-default pl-3 text-role-caption italic text-text-muted',
  table: 'w-full border-collapse border border-border-soft text-role-caption',
  thead: 'bg-surface-canvas',
  th: 'border border-border-soft px-2 py-1.5 text-left font-semibold text-text-muted',
  td: 'border border-border-soft px-2 py-1.5 text-text-default',
  hr: 'my-3 border-border-soft',
  a: 'text-blue-600 underline underline-offset-2 hover:text-blue-800',
};

const AI_SKIN: MarkdownSkin = {
  p: 'mb-3 text-ai-prose text-ai-ink last:mb-0 [animation:ai-chunk-in_260ms_ease-out]',
  h1: 'mb-2 mt-5 text-ai-title text-ai-ink first:mt-0 [animation:ai-chunk-in_260ms_ease-out]',
  h2: 'mb-2 mt-4 text-ai-title text-ai-ink first:mt-0 [animation:ai-chunk-in_260ms_ease-out]',
  h3: 'mb-1.5 mt-4 text-ai-title text-ai-ink first:mt-0 [animation:ai-chunk-in_260ms_ease-out]',
  flatHeading: 'mb-2 text-ai-prose font-semibold',
  strong: 'font-semibold text-ai-ink',
  em: 'italic text-ai-muted',
  ulParent: 'mb-3 ml-5 list-disc space-y-1.5 text-ai-prose text-ai-ink marker:text-ai-faint last:mb-0',
  ulChild: "mb-1 ml-4 mt-1 list-['–'] space-y-1 marker:text-ai-faint",
  olParent: 'mb-3 ml-5 list-decimal space-y-1.5 text-ai-prose text-ai-ink marker:text-ai-faint last:mb-0',
  olChild: 'mb-1 ml-4 mt-1 list-decimal space-y-1 marker:text-ai-faint',
  liParent: 'pl-1 [&>p]:mb-0 [animation:ai-chunk-in_260ms_ease-out]',
  liChild: 'pl-1 text-ai-prose-sm text-ai-muted [&>p]:mb-0',
  code: 'rounded-ai-control bg-ai-sunken px-1.5 py-0.5 font-mono text-[0.875em] text-ai-ink',
  blockquote: 'mb-3 border-l-2 border-ai-line-strong pl-4 text-ai-prose italic text-ai-muted',
  table: 'w-full border-collapse text-ai-prose-sm',
  thead: 'bg-ai-sunken',
  th: 'border-b border-ai-line px-3 py-2 text-left font-semibold text-ai-muted',
  td: 'border-b border-ai-line px-3 py-2 text-ai-ink',
  hr: 'my-5 border-ai-line',
  a: 'text-ai-ink underline decoration-ai-line-strong underline-offset-2 hover:decoration-ai-ink',
};

const SkinContext = createContext<MarkdownSkin>(HOUSE_SKIN);
const ListDepthContext = createContext(0);

/** Display tiers: parent → child, and depth 3+ renders as a flat child. */
const MAX_LIST_DEPTH = 2;

function UnorderedList({ children }: { children?: ReactNode }) {
  const skin = useContext(SkinContext);
  const depth = Math.min(useContext(ListDepthContext), MAX_LIST_DEPTH);
  return (
    <ListDepthContext.Provider value={Math.min(depth + 1, MAX_LIST_DEPTH)}>
      <ul className={depth === 0 ? skin.ulParent : skin.ulChild}>{children}</ul>
    </ListDepthContext.Provider>
  );
}

function OrderedList({ children }: { children?: ReactNode }) {
  const skin = useContext(SkinContext);
  const depth = Math.min(useContext(ListDepthContext), MAX_LIST_DEPTH);
  return (
    <ListDepthContext.Provider value={Math.min(depth + 1, MAX_LIST_DEPTH)}>
      <ol className={depth === 0 ? skin.olParent : skin.olChild}>{children}</ol>
    </ListDepthContext.Provider>
  );
}

function ListItem({ children }: { children?: ReactNode }) {
  const skin = useContext(SkinContext);
  const child = Math.min(useContext(ListDepthContext), MAX_LIST_DEPTH) >= MAX_LIST_DEPTH;
  // [&>p]:mb-0 — a paragraph directly inside a list item is tight-list
  // wrapping from react-markdown, not a rhythm break; it must not inflate.
  return <li className={child ? skin.liChild : skin.liParent}>{children}</li>;
}

export default function MarkdownRenderer({
  content,
  variant = 'prose',
}: {
  content: string;
  variant?: MarkdownVariant;
}) {
  const skin = variant === 'ai' || variant === 'ai-bubble' ? AI_SKIN : HOUSE_SKIN;
  const components = useMemo<Components>(() => {
    const flat = variant === 'bubble' || variant === 'ai-bubble';
    const FlatHeading = ({ children }: { children?: ReactNode }) => (
      <p className={skin.flatHeading}>
        <strong className={skin.strong}>{children}</strong>
      </p>
    );
    return {
      h1: flat ? FlatHeading : ({ children }) => <h1 className={skin.h1}>{children}</h1>,
      h2: flat ? FlatHeading : ({ children }) => <h2 className={skin.h2}>{children}</h2>,
      h3: flat ? FlatHeading : ({ children }) => <h3 className={skin.h3}>{children}</h3>,
      p: ({ children }) => <p className={skin.p}>{children}</p>,
      strong: ({ children }) => <strong className={skin.strong}>{children}</strong>,
      em: ({ children }) => <em className={skin.em}>{children}</em>,
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
          <code className={skin.code} {...props}>
            {children}
          </code>
        );
      },
      // CodeBlock renders its own <pre>; pass through so we don't double-wrap.
      pre: ({ children }) => <>{children}</>,
      blockquote: ({ children }) => <blockquote className={skin.blockquote}>{children}</blockquote>,
      table: ({ children }) => (
        <div className="mb-2 overflow-x-auto">
          <table className={skin.table}>{children}</table>
        </div>
      ),
      thead: ({ children }) => <thead className={skin.thead}>{children}</thead>,
      th: ({ children }) => <th className={skin.th}>{children}</th>,
      td: ({ children }) => <td className={skin.td}>{children}</td>,
      hr: () => <hr className={skin.hr} />,
      a: ({ href, children }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className={skin.a}>
          {children}
        </a>
      ),
    };
  }, [variant, skin]);

  return (
    <SkinContext.Provider value={skin}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </SkinContext.Provider>
  );
}
