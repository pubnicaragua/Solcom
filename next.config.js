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
}

module.exports = nextConfig
