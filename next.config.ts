import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";

function getPrivateLanOrigins() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((address) => {
      if (!address || address.family !== "IPv4" || address.internal) return false;
      return /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)/.test(address.address);
    })
    .map((address) => address!.address);
}

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  allowedDevOrigins: getPrivateLanOrigins(),
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
      },
    ],
  },
};

export default nextConfig;
