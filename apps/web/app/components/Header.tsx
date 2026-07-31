'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useNotification } from './NotificationProvider';
import Image from 'next/image';

type CurrentUser = {
  id: number;
  username: string;
  email?: string;
};

const authStorageKey = 'respawn-auth';

export default function Header() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const { notify } = useNotification();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(authStorageKey);
    if (stored) {
      try {
        const auth = JSON.parse(stored) as { token: string; user: CurrentUser };
        setUser(auth.user);
      } catch {
        window.localStorage.removeItem(authStorageKey);
      }
    }
  }, []);

  const signOut = () => {
    setUser(null);
    window.localStorage.removeItem(authStorageKey);
    notify('Signed out.', 'success');
  };

  return (
    <header className="app-header small">
      <div className="header-left">
        <Link href="/" className="brand">
          <Image src="/icon.png" alt="" width={24} height={24} />
          Respawn Build Maker
        </Link>
        <nav className="app-nav">
          <Link href="/templates">Templates</Link>
          <Link href="/builds">Builds</Link>
        </nav>
  </div>

      <div className="login-panel">
        <div className="login-status">
          {user ? (
            <>
              <Link href="/profile" className="user-link">{user.username}</Link>
              <button type="button" className="button small secondary" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <>
              <span className="guest">Guest</span>
              <Link href="/profile" className="button small">Login</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
