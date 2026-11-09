import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import { InstallPwaPrompt } from '@/components/InstallPwaPrompt';
import './globals.css';

export const metadata: Metadata = {
  title: 'DialyCare - Hemodialysis Patient Adherence Tracker',
  description:
    'Comprehensive Hemodialysis Patient Adherence, Fluid & Diet Tracking, and Renal Coaching Platform',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/icons/icon-192.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/icon-192.png', sizes: '192x192' },
      { url: '/icons/icon-512.png', sizes: '512x512' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'DialyCare',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#1e6bb8',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col font-sans">
        <AuthProvider>
          <ServiceWorkerRegister />
          <InstallPwaPrompt />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
