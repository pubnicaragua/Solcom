import '@/styles/globals.css';
import type { Metadata } from 'next';
import ModernAlertBridge from '@/components/ui/ModernAlertBridge';
import NotificationsProvider from '@/components/providers/NotificationsProvider';

export const metadata: Metadata = {
  title: {
    default: 'Solis Comercial - Dashboard de Inventario Multi-Bodega',
    template: '%s | Solis Comercial'
  },
  description: 'Sistema completo de gestión de inventario multi-bodega con sincronización Zoho Creator, agentes IA, y API pública para integraciones externas. ¡A tu servicio, siempre!',
  keywords: [
    'inventario',
    'gestión de inventario',
    'Solis Comercial',
    'Nicaragua',
    'multi-bodega',
    'Zoho Creator',
    'agentes IA',
    'API inventario',
    'dashboard',
    'Supabase'
  ],
  authors: [{ name: 'Solis Comercial' }],
  creator: 'Solis Comercial',
  publisher: 'Solis Comercial',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://soliscomercialni.com'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Solis Comercial - Dashboard de Inventario',
    description: 'Sistema de gestión de inventario multi-bodega con IA y API pública',
    url: 'https://soliscomercialni.com',
    siteName: 'Solis Comercial',
    images: [
      {
        url: 'https://www.soliscomercialni.com/Solis%20Comercial%20Logo.png',
        width: 1200,
        height: 630,
        alt: 'Solis Comercial Logo',
      },
    ],
    locale: 'es_NI',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Solis Comercial - Dashboard de Inventario',
    description: 'Sistema de gestión de inventario multi-bodega con IA',
    images: ['https://www.soliscomercialni.com/Solis%20Comercial%20Logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="theme-color" content="#FF0000" />
        <link rel="icon" type="image/png" href="https://www.soliscomercialni.com/Solis%20Comercial%20Logo.png" />
        <link rel="apple-touch-icon" href="https://www.soliscomercialni.com/Solis%20Comercial%20Logo.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <NotificationsProvider>
          <ModernAlertBridge />
          {children}
        </NotificationsProvider>
      </body>
    </html>
  );
}
