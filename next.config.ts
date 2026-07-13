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
  // Baseline security headers on every route. A full script/style CSP is left as
  // a follow-up (Next's inline bootstrap needs a nonce), but framing is locked
  // down now via X-Frame-Options + CSP frame-ancestors. HSTS is inert over http.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
