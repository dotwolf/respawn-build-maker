import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { SITE_URL } from './lib/site';
import Header from './components/Header';
import {NotificationProvider} from './components/NotificationProvider';
import {OptimizerStoreProvider} from './components/OptimizerStore';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Respawn Build Maker',
    template: '%s | Respawn Build Maker',
  },
  description:
    'Create, share, and vote on RPG character builds. Define game stats, items, equipment slots, and level rules with Templates, then craft and publish Builds against any ruleset.',
  keywords: [
    'rpg',
    'build planner',
    'character builds',
    'build maker',
    'template',
    'builder',
    'stat planner',
    'game builds',
    'rpg planner',
  ],
  authors: [{ name: 'Respawn Build Maker' }],
  creator: 'Respawn Build Maker',
  publisher: 'Respawn Build Maker',
  category: 'gaming',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    siteName: 'Respawn Build Maker',
    title: 'Respawn Build Maker',
    description:
      'Create, share, and vote on RPG character builds. Define game stats, items, equipment slots, and level rules with Templates, then craft and publish Builds against any ruleset.',
    url: SITE_URL,
    locale: 'en_US',
    images: [
      {
        url: `${SITE_URL}/icon.png`,
        width: 512,
        height: 512,
        alt: 'Respawn Build Maker',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Respawn Build Maker',
    description:
      'Create, share, and vote on RPG character builds. Define game stats, items, equipment slots, and level rules with Templates, then craft and publish Builds against any ruleset.',
    images: [`${SITE_URL}/icon.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#ca7c33',
  width: 'device-width',
  initialScale: 1,
};

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NotificationProvider>
          <OptimizerStoreProvider>
            <Header />
            <div className="page-shell">{children}</div>
          </OptimizerStoreProvider>
        </NotificationProvider>
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Respawn Build Maker',
            url: SITE_URL,
            description:
              'Create, share, and vote on RPG character builds. Define game stats, items, equipment slots, and level rules with Templates, then craft and publish Builds against any ruleset.',
            inLanguage: 'en-US',
          }}
        />
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Respawn Build Maker',
            applicationCategory: 'GameApplication',
            operatingSystem: 'Web',
            description:
              'RPG build planner. Create Templates that define a game\'s stats, items, equipment slots, and level rules, then craft, share, and vote on character Builds.',
            url: SITE_URL,
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
            },
          }}
        />
      </body>
    </html>
  );
}
