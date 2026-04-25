/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_SERVICE_URL ?? 'http://localhost:8080';
    const aiBase = process.env.NEXT_PUBLIC_AI_SERVICE_URL ?? 'http://localhost:3001';
    return [
      {
        source: '/backend/:path*',
        destination: `${apiBase}/:path*`,
      },
      {
        source: '/aibackend/:path*',
        destination: `${aiBase}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
