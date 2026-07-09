import Link from "next/link";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// shadcn-style pagination built on Next <Link> so paging is pure navigation
// (bookmarkable URLs, no client JS). Labels are passed in by the caller to keep
// it i18n-friendly.
function Pagination({
  className,
  "aria-label": ariaLabel = "pagination",
  ...props
}: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      // Landmark name is caller-supplied so it can be localized; falls back to the
      // English literal only when no label is passed.
      aria-label={ariaLabel}
      data-slot="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul className={cn("flex flex-row items-center gap-1", className)} {...props} />;
}

function PaginationItem(props: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps = {
  isActive?: boolean;
  size?: "icon-sm" | "sm";
} & React.ComponentProps<typeof Link>;

function PaginationLink({ className, isActive, size = "icon-sm", ...props }: PaginationLinkProps) {
  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={cn(
        buttonVariants({ variant: isActive ? "outline" : "ghost", size }),
        "tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

function PaginationPrevious({
  label,
  ...props
}: PaginationLinkProps & { label: string }) {
  return (
    <PaginationLink size="sm" aria-label={label} {...props}>
      <ChevronLeft className="size-4" />
      <span className="hidden sm:inline">{label}</span>
    </PaginationLink>
  );
}

function PaginationNext({ label, ...props }: PaginationLinkProps & { label: string }) {
  return (
    <PaginationLink size="sm" aria-label={label} {...props}>
      <span className="hidden sm:inline">{label}</span>
      <ChevronRight className="size-4" />
    </PaginationLink>
  );
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn("flex size-7 items-center justify-center text-muted-foreground", className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
