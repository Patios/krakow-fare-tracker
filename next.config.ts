import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  // GitHub Pages serves the site from /krakow-fare-tracker. Leave the variable
  // unset for local `next dev`, which stays at the domain root.
  output: "export",
  trailingSlash: true,
  ...(basePath ? { basePath } : {}),
  // The dev server binds 0.0.0.0, so browsers that open 127.0.0.1 must be allowed
  // to load /_next assets. Without this, the page stays on the server-rendered shell.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Cache Components turns on PPR, which Next.js refuses in export mode.
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
