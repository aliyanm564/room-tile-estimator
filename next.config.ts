import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: let phones/tablets on the local network load the dev server
  // (`npm run dev -- -H 0.0.0.0`, then open http://<LAN IP>:3000). Without this,
  // Next blocks its dev resources for non-localhost hosts and the page never hydrates.
  // `*` matches exactly one hostname label. Has no effect on `next build` / `next start`.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "*.local"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
