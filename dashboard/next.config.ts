import type { NextConfig } from "next";

// Every page reads bench files, the ledger SQLite and the gateway at request time.
// Cache Components stays off so `export const dynamic = "force-dynamic"` applies.
const nextConfig: NextConfig = {
  cacheComponents: false,
};

export default nextConfig;
