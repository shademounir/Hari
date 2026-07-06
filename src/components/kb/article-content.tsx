import { Fragment, type ReactNode } from "react";
import { jsx, jsxs } from "react/jsx-runtime";
import { unified } from "unified";
import rehypeParse from "rehype-parse";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeReact, { type Options as RehypeReactOptions } from "rehype-react";
import { rehypeKbAnchors } from "./kb-anchors-rehype";
import { HighlightOnHash } from "./highlight-on-hash";

// Reader rendering of an article's stored HTML (authored in BlockNote). Pipeline:
// parse → SANITIZE (XSS-safe; runs before anchors so it can't strip the ids) →
// rehypeKbAnchors (adds h2/h3 ids via the shared slugger, matching the RAG
// chunker so citation deep-links resolve) → React with our element styling.
//
// clobberPrefix:"" keeps heading ids verbatim (the default "user-content-" prefix
// would break `#anchor` links); `id` is allowed on headings so anchors survive.
const schema = {
  ...defaultSchema,
  clobberPrefix: "",
  attributes: {
    ...defaultSchema.attributes,
    h1: [...(defaultSchema.attributes?.h1 ?? []), "id"],
    h2: [...(defaultSchema.attributes?.h2 ?? []), "id"],
    h3: [...(defaultSchema.attributes?.h3 ?? []), "id"],
  },
};

const heading = (Tag: "h2" | "h3", cls: string) => {
  const Heading = ({ id, children }: { id?: string; children?: ReactNode }) => (
    <Tag id={id} className={`scroll-mt-24 ${cls}`}>
      {children}
    </Tag>
  );
  Heading.displayName = `Heading(${Tag})`;
  return Heading;
};

const components = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="mb-2 mt-6 text-2xl font-semibold first:mt-0">{children}</h1>
  ),
  h2: heading("h2", "mb-2 mt-7 text-xl font-semibold first:mt-0"),
  h3: heading("h3", "mb-1.5 mt-6 text-lg font-semibold"),
  p: ({ children }: { children?: ReactNode }) => <p className="my-3 leading-relaxed">{children}</p>,
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="my-2 list-disc space-y-1 pl-6">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="my-2 list-decimal space-y-1 pl-6">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: ReactNode }) => <em className="italic">{children}</em>,
  a: ({ href, children }: { href?: string; children?: ReactNode }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }: { children?: ReactNode }) => (
    <blockquote className="my-3 border-l-2 pl-4 text-muted-foreground">{children}</blockquote>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
  pre: ({ children }: { children?: ReactNode }) => (
    <pre className="my-3 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">{children}</pre>
  ),
  table: ({ children }: { children?: ReactNode }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border px-2 py-1 text-left font-medium">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => <td className="border px-2 py-1">{children}</td>,
  hr: () => <hr className="my-4" />,
};

const rehypeReactOptions: RehypeReactOptions = {
  Fragment,
  jsx,
  jsxs,
  development: false,
  components,
  // rehype-react's production-runtime option types (via hast-util-to-jsx-runtime)
  // clash with React 19's JSX.Element type; the runtime is the documented usage.
} as unknown as RehypeReactOptions;

const processor = unified()
  .use(rehypeParse, { fragment: true })
  .use(rehypeSanitize, schema)
  .use(rehypeKbAnchors)
  .use(rehypeReact, rehypeReactOptions);

export function ArticleContent({ content }: { content: string }) {
  const rendered = processor.processSync(content).result as unknown as ReactNode;
  return (
    // Comfortable long-form reading size (16px), a step up from the app's dense 14px.
    <div className="text-base">
      <HighlightOnHash />
      {rendered}
    </div>
  );
}
