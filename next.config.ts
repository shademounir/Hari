import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    // next/image transcodes to these on the fly (smaller than PNG/JPEG); AVIF
    // first with a WebP fallback. Applies to all <Image> sources — the brand
    // logos and KB covers (same-origin /api/kb/images/… object-storage paths).
    formats: ["image/avif", "image/webp"],
  },
};

export default withNextIntl(nextConfig);
