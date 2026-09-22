import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@cnmcp/schema", "@cnmcp/doctor"],
  env: {
    API_URL: process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787",
  },
};

export default nextConfig;
