import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // An unrelated lockfile sits above this directory; pin the tracing root so
  // the build does not walk up and treat the parent folder as the project.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
