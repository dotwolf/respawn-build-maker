import type { ReactNode } from 'react';
import Header from './components/Header';
import NotificationProvider from './components/NotificationProvider';
import './globals.css';

export const metadata = {
  title: 'Respawn Build Maker',
  description: 'Create and share RPG builds with Builders and templates.',
  icons: {
    icon: '/icon.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NotificationProvider>
          <Header />
          <div className="page-shell">{children}</div>
        </NotificationProvider>
      </body>
    </html>
  );
}
