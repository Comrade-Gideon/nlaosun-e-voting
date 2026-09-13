import type { NextConfig } from "next";

// Candidate photos and announcement images are served from the public R2 bucket,
// either its r2.dev subdomain or a custom domain set in R2_PUBLIC_BASE_URL.
const publicBucketHost = (() => {
  try {
    return process.env.R2_PUBLIC_BASE_URL ? new URL(process.env.R2_PUBLIC_BASE_URL).hostname : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  // Without this, Next.js inlines @prisma/client using Node's export conditions,
  // which pins the native query engine into the bundle. On Cloudflare Workers
  // that fails with "could not locate the Query Engine for runtime
  // debian-openssl-…". Kept external, the OpenNext build resolves Prisma with the
  // workerd condition and loads the WebAssembly engine the Neon adapter drives.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
  images: {
    remotePatterns: [
      { protocol: "https" as const, hostname: "**.r2.dev" },
      ...(publicBucketHost ? [{ protocol: "https" as const, hostname: publicBucketHost }] : []),
    ],
  },
  experimental: { useTypeScriptCli: false },
};

export default nextConfig;
