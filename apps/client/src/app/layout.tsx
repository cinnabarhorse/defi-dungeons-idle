import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';

const publicUrl = process.env.NEXT_PUBLIC_URL;
const metadataBase = publicUrl ? new URL(publicUrl) : undefined;

export const dynamic = 'force-dynamic';
export const revalidate = 0;
import './globals.css';
import { Web3Provider } from '../components/providers/Web3Provider';
import { hudFont } from '../lib/fonts';
import { BottomTabs } from '../components/navigation/BottomTabs';
import { SessionProvider } from '../components/providers/SessionProvider';
import { PlayerProvider } from '../components/providers/PlayerProvider';
import { BaseMiniAppReady } from '../components/base-miniapp/ready';
import { DevServiceWorkerReset } from '../components/dev/DevServiceWorkerReset';

export const metadata: Metadata = {
  title: 'DeFi Dungeons Idle',
  description:
    'An Aavegotchi idle dungeon crawler with run-based progression, loot, crafting, and DeFi rewards.',
  metadataBase,
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192x192.png',
    apple: '/icon-192x192.png',
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: 'website',
    title: 'DeFi Dungeons Idle',
    description:
      'An Aavegotchi idle dungeon crawler with run-based progression, loot, crafting, and DeFi rewards.',
    url: publicUrl || undefined,
    images: [
      {
        url: metadataBase
          ? new URL('/icon-512x512.png', metadataBase).toString()
          : '/icon-512x512.png',
        width: 512,
        height: 512,
        alt: 'DeFi Dungeons Idle',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'DeFi Dungeons Idle',
    description:
      'An Aavegotchi idle dungeon crawler with run-based progression, loot, crafting, and DeFi rewards.',
    images: [
      metadataBase
        ? new URL('/icon-512x512.png', metadataBase).toString()
        : '/icon-512x512.png',
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'DeFi Dungeons Idle',
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'fc:miniapp': JSON.stringify({
      version: 'next',
      imageUrl: metadataBase
        ? new URL('/icon-512x512.png', metadataBase).toString()
        : '/icon-512x512.png',
      button: {
        title: 'Play Now',
        action: {
          type: 'launch_miniapp',
          name: 'DeFi Dungeons Idle',
          url: publicUrl ?? '',
          splashImageUrl: metadataBase
            ? new URL('/images/splash.png', metadataBase).toString()
            : '/images/splash.png',
          splashBackgroundColor: '#000000',
        },
      },
    }),
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#2c3e50',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${hudFont.variable} h-full`}
    >
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="h-full font-sans">
        <BaseMiniAppReady />
        <DevServiceWorkerReset />
        <Web3Provider>
          <SessionProvider>
            <PlayerProvider>
              <Suspense fallback={<div className="h-full" />}>
                <div className="h-full">
                  {children}
                  <BottomTabs />
                </div>
              </Suspense>
            </PlayerProvider>
          </SessionProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
