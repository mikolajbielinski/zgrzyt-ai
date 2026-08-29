import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  outputFileTracingExcludes: {
    "*": [
      "node_modules/typescript/**",
      "node_modules/@img/**",
      "node_modules/sharp/**",
      "node_modules/@esbuild/**",
      "node_modules/caniuse-lite/**",
    ],
  },
};

export default nextConfig;
