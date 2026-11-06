import type { NextConfig } from "next";

// Every page reads bench files, the ledger SQLite and the gateway at request time.
// Cache Components stays off so `export const dynamic = "force-dynamic"` applies.
const nextConfig: NextConfig = {
  cacheComponents: false,
  // The hosted build reads ./snapshot at request time (see lib/env.ts); make sure it ships with every function.
  outputFileTracingIncludes: {
    "/": ["./snapshot/**/*"],
    "/*": ["./snapshot/**/*"],
    "/**": ["./snapshot/**/*"],
  },
};

export default nextConfig;
