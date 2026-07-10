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
  // SCRUM-081: pdfkit resolves its standard-font .afm files relative to its own
  // package directory (`__dirname`) at runtime. Bundling it (webpack/Turbopack)
  // rewrites that path and breaks the lookup (ENOENT on Helvetica.afm), so it
  // must stay an external require in the server bundle instead.
  serverExternalPackages: ["pdfkit"],
};

export default withNextIntl(nextConfig);
