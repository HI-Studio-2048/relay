import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["postgres", "ioredis", "@electric-sql/pglite"],
};

export default nextConfig;
