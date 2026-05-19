import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,

  // Prevent browsers from caching HTML so users always pick up the latest
  // chunk URLs after a new deploy. The JS chunks themselves are content-
  // hashed and stay cacheable.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
