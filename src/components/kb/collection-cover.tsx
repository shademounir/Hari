import Image from "next/image";
import { cn } from "@/lib/utils";

// Decorative KB collection cover. Covers uploaded through the app are same-origin
// object-storage proxy paths (/api/kb/images/…), which next/image serves as lazy,
// optimized AVIF/WebP. Anything else (legacy inline data: URLs, or external URLs
// that the optimizer can't serve without images.remotePatterns) falls back to a
// plain <img>, so it renders instead of crashing the page. `alt=""` — decorative.
export function CollectionCover({
  src,
  className,
  sizes = "(max-width: 768px) 100vw, 400px",
}: {
  src: string;
  className?: string;
  sizes?: string;
}) {
  const wrapper = cn("relative overflow-hidden bg-muted", className);
  const optimizable = src.startsWith("/api/kb/images/");

  if (!optimizable) {
    return (
      <div className={wrapper}>
        {/* eslint-disable-next-line @next/next/no-img-element -- legacy data:/external URL; not servable by the next/image optimizer */}
        <img src={src} alt="" className="absolute inset-0 size-full object-cover" />
      </div>
    );
  }

  return (
    <div className={wrapper}>
      <Image src={src} alt="" fill sizes={sizes} className="object-cover" />
    </div>
  );
}
