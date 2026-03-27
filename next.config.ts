import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // outputFileTracingRoot: path.resolve(__dirname, '../../'),
  /* config options here */
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lf-coze-web-cdn.coze.cn',
        pathname: '/**',
      },
    ],
  },
  // 禁用 React Strict Mode，减少不必要的重新渲染
  reactStrictMode: false,
};

export default nextConfig;
