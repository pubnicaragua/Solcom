/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    domains: ['www.soliscomercialni.com'],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Optimizaciones para Vercel
  swcMinify: true,
  compress: true,
  poweredByHeader: false,
  generateEtags: true,
  async headers() {
    return [
      {
        // Permitir acceso a camara en las paginas del escaner
        source: '/alistamiento/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=()',
          },
        ],
      },
    ];
  },
}

module.exports = nextConfig
