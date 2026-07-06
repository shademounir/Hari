"use client";

import { memo } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import type { PluggableList } from "unified";
import remarkGfm from "remark-gfm";
import { rehypeCitations, type CitationTarget } from "./citations-rehype";

// Markdown renderer for assistant messages. Element styles are inline (Tailwind)
// so no typography plugin is required. GFM adds tables, strikethrough, task lists.
const components: Components = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <h1 className="mb-1 mt-2 text-base font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1 mt-2 text-sm font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>,
  a: ({ children, href, className }) => {
    const isCitation = typeof className === "string" && className.includes("citation-ref");
    const isInternal = !!href && href.startsWith("/");
    // Inline [n] citation marker → superscript link to the exact article section.
    if (isCitation && href) {
      // Open in a new tab so reading a source doesn't abandon the conversation.
      return (
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-0.5 align-super text-[0.7em] font-medium text-primary no-underline hover:underline"
        >
          {children}
        </Link>
      );
    }
    // Other internal links: new tab too (don't abandon the conversation).
    if (isInternal) {
      return (
        <Link
          href={href!}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline underline-offset-2"
        >
          {children}
        </Link>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline underline-offset-2"
      >
        {children}
      </a>
    );
  },
  code: ({ className, children }) => {
    // A fenced block may have no language info-string (className undefined);
    // treat multi-line content as a block too.
    const isBlock = !!className?.includes("language-") || /\n/.test(String(children));
    if (isBlock) {
      return (
        <code className="block overflow-x-auto rounded-md bg-background/70 p-2 font-mono text-xs">
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-background/70 px-1 py-0.5 font-mono text-[0.85em]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => <pre className="my-2">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 pl-3 text-muted-foreground">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border px-2 py-1 text-left font-medium">{children}</th>
  ),
  td: ({ children }) => <td className="border px-2 py-1">{children}</td>,
  hr: () => <hr className="my-2" />,
};

// Memoized on `children` + `citations`: completed messages don't re-run the full
// remark/micromark parse when a new token arrives for the streaming message.
export const Markdown = memo(function Markdown({
  children,
  citations,
}: {
  children: string;
  citations?: Map<number, CitationTarget>;
}) {
  // Tuple [plugin, options] so unified calls the attacher with the tree; passing
  // rehypeCitations(citations) directly would invoke the transformer with no tree.
  const rehypePlugins: PluggableList =
    citations && citations.size > 0 ? [[rehypeCitations, citations]] : [];
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins} components={components}>
      {children}
    </ReactMarkdown>
  );
});
