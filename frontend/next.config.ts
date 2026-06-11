import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Proxy API calls to the Laravel backend so the browser only talks to
  // the frontend origin (no CORS, backend can stay on loopback).
  async rewrites() {
    const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
