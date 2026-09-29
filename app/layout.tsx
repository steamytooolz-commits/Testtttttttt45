import type {Metadata, Viewport} from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { ServiceWorkerRegister } from './components/sw-register';
import { ThemeInit } from './components/theme-init';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0455d8',
};

export const metadata: Metadata = {
  title: 'Stationery Depot Core',
  description: 'Security-critical B2B wholesale platform featuring high-throughput matrix ordering, CSV ingestion, and recurring requisition templates.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'StatDepot',
  },
  icons: {
    icon: '/brand-logo.png',
    apple: '/brand-logo.png',
  },
  openGraph: {
    title: 'Stationery Depot Core',
    description: 'Security-critical B2B wholesale platform featuring high-throughput matrix ordering, CSV ingestion, and recurring requisition templates.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stationery Depot Core',
    description: 'Security-critical B2B wholesale platform featuring high-throughput matrix ordering, CSV ingestion, and recurring requisition templates.',
  },
};

export default async function RootLayout({children}: {children: React.ReactNode}) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get('sd-theme')?.value;
  const isDark = themeCookie === 'dark';

  return (
    <html lang="en" suppressHydrationWarning className={isDark ? 'dark' : undefined}>
      <body suppressHydrationWarning>
        <ThemeInit />
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
