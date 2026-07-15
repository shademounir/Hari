import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  /**
   * Match the page's own content container (e.g. "mx-auto max-w-4xl") when that
   * container is centered. The header is full-bleed by default, so on a screen
   * wider than the container the title would otherwise sit far to the left of
   * the body it titles instead of sharing its left edge.
   */
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 px-4 pt-6 md:flex-row md:items-start md:justify-between md:px-8 md:pt-8",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground md:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-sm text-muted-foreground md:text-base">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </div>
  );
}
