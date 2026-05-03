import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// CSP is intentionally lenient in dev for Next.js HMR/React Refresh.
// In prod we tighten script-src and add upgrade-insecure-requests.
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' ${isProd ? "'unsafe-inline'" : "'unsafe-inline' 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "Content-Security-Policy", value: cspDirectives },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  images: {
    formats: ["image/webp"],
    // Mobile (320-640) + tablet (768) + desktop (1024+) breakpoint'lerine
    // optimize. Default'tan daha küçük çünkü kitap kapakları büyük gerektirmez.
    deviceSizes: [320, 480, 640, 768, 1024, 1280, 1536],
    imageSizes: [64, 96, 128, 192, 256, 320],
    // Optimized image cache TTL — 1 gün. Görseller değişmez (filename hashed).
    minimumCacheTTL: 60 * 60 * 24,
    // Vercel Blob'tan servis edilen ürün görselleri.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
        pathname: "/**",
      },
    ],
  },
  serverExternalPackages: ["pg"],
  // Build sırasında dev SourceMap'lerini production'a sızdırma (size + leak).
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // Statik ürün görselleri — immutable cache (filename hash bazlı, asla
      // değişmez). 1 yıl + immutable directive ile CDN/Browser cache full hit.
      {
        source: "/images/products/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      // Brand logo + favicon türü — uzun cache + revalidate
      {
        source: "/(me-mark|me-logo-v2|me-icon-v2).png",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
