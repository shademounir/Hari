import Image from "next/image";
import { cn } from "@/lib/utils";

// Official HARI brand assets (public/assets):
//  • Legacy → the gradient H-mark (works on any background)
//  • Dark   → navy wordmark, for LIGHT backgrounds (light mode)
//  • Light  → light wordmark, for DARK backgrounds (dark mode)
const MARK = "/assets/Logo_HARI_Legacy.webp";
const WORDMARK_FOR_LIGHT = "/assets/Logo_HARI_Dark.webp";
const WORDMARK_FOR_DARK = "/assets/Logo_HARI_Light.webp";

/** Compact square H-mark (favicons, avatars, tight spots). */
export function HariMark({ className }: { className?: string }) {
  return (
    <Image
      src={MARK}
      alt="HARI"
      width={287}
      height={287}
      priority
      className={cn("size-7 w-auto object-contain", className)}
    />
  );
}

/**
 * The standardized HARI logo: the H-mark + the wordmark.
 *
 * `variant`:
 *  • "auto"    (default) — wordmark follows the theme (navy in light, light in dark)
 *  • "onDark"  — force the light wordmark (for always-dark surfaces, e.g. login hero)
 *  • "onLight" — force the navy wordmark (for always-light surfaces)
 */
export function HariLogo({
  className,
  markClassName,
  wordmarkClassName,
  variant = "auto",
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  variant?: "auto" | "onDark" | "onLight";
}) {
  const mark = (
    <Image
      src={MARK}
      alt=""
      aria-hidden
      width={287}
      height={287}
      priority
      className={cn("size-8 w-auto shrink-0 object-contain", markClassName)}
    />
  );
  const wm = "h-6 w-auto object-contain";

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {mark}
      {variant === "onDark" && (
        <Image
          src={WORDMARK_FOR_DARK}
          alt="HARI"
          width={506}
          height={105}
          priority
          className={cn(wm, wordmarkClassName)}
        />
      )}
      {variant === "onLight" && (
        <Image
          src={WORDMARK_FOR_LIGHT}
          alt="HARI"
          width={506}
          height={105}
          priority
          className={cn(wm, wordmarkClassName)}
        />
      )}
      {variant === "auto" && (
        <>
          <Image
            src={WORDMARK_FOR_LIGHT}
            alt="HARI"
            width={506}
            height={105}
            priority
            className={cn(wm, "block dark:hidden", wordmarkClassName)}
          />
          <Image
            src={WORDMARK_FOR_DARK}
            alt="HARI"
            width={506}
            height={105}
            priority
            className={cn(wm, "hidden dark:block", wordmarkClassName)}
          />
        </>
      )}
    </span>
  );
}
