import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async rewrites() {
    // The demo shop is a static single-page app; every /demo route serves its index.html.
    return [
      { source: "/demo", destination: "/demo/index.html" },
      { source: "/demo/:path((?!.*\\.).*)", destination: "/demo/index.html" },
    ];
  },
  async headers() {
    return [
      {
        source: "/:file(optic.js|rrweb-record.js)",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
