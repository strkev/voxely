import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=*, microphone=*, geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
  ...(process.env.NODE_ENV === 'development' ? {
    allowedDevOrigins: [
      'localhost:3000',
      '0.0.0.0:3000',
      (() => {
        try {
          return process.env.NEXT_PUBLIC_API_URL ? new URL(process.env.NEXT_PUBLIC_API_URL).hostname : 'localhost';
        } catch {
          return 'localhost';
        }
      })(),
    ],
  } : {}),
};

export default nextConfig;
