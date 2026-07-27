import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./config/securityHeaders";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS.map((header) => ({ ...header }))
      }
    ];
  }
};

export default nextConfig;
