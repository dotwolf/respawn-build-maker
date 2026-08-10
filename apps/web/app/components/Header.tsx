'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useNotification } from './NotificationProvider';
import Image from 'next/image';
import {
  getSuggestionNotifications,
  getUnreadSuggestionNotificationCount,
  listPendingSuggestionNotifications,
} from '../lib/suggestions';
import type { SuggestionNotification, PendingSuggestionNotification } from '../lib/suggestions';

type CurrentUser = {
  id: number;
  username: string;
  email?: string;
};

const authStorageKey = 'respawn-auth';
const POLL_MS = 20000;

export default function Header() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [suggestionNotifs, setSuggestionNotifs] = useState<SuggestionNotification[]>([]);
  const [unreadAcceptedCount, setUnreadAcceptedCount] = useState(0);
  const [pendingNotifs, setPendingNotifs] = useState<PendingSuggestionNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState<'accepted' | 'pending' | null>(null);
  const { notify } = useNotification();
  const pathname = usePathname();

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

  // Poll for notification changes on every page (re-runs on each route change,
  // plus a periodic refresh while the user stays on a page). The unread-accepted
  // count is fetched separately so the badge is not consumed until the user
  // opens it — the list endpoint itself marks notifications as delivered.
  useEffect(() => {
    if (!user) {
      setUnreadAcceptedCount(0);
      setPendingNotifs([]);
      return;
    }
    let cancelled = false;

    const refresh = () => {
      getUnreadSuggestionNotificationCount()
        .then((n) => {
          if (!cancelled) setUnreadAcceptedCount(n);
        })
        .catch(() => {});
      listPendingSuggestionNotifications()
        .then((data) => {
          if (!cancelled) setPendingNotifs(Array.isArray(data) ? data : []);
        })
        .catch(() => {});
    };

    refresh();
    const id = window.setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [user, pathname]);

  // Opening the accepted-notifications popover consumes the notifications
  // (the API marks them as delivered), so they only show once.
  const openAcceptedNotifications = () => {
    setNotifOpen('accepted');
    getSuggestionNotifications()
      .then((data) => {
        setSuggestionNotifs(Array.isArray(data) ? data : []);
        setUnreadAcceptedCount(0);
      })
      .catch(() => setSuggestionNotifs([]));
  };

  const openPendingNotifications = () => {
    setNotifOpen('pending');
    listPendingSuggestionNotifications()
      .then((data) => setPendingNotifs(Array.isArray(data) ? data : []))
      .catch(() => {});
  };

  const closeNotifications = () => {
    setNotifOpen(null);
    setSuggestionNotifs([]);
  };

  const signOut = () => {
    setUser(null);
    window.localStorage.removeItem(authStorageKey);
    notify('Signed out.', 'success');
  };

  const totalPending = pendingNotifs.reduce((sum, n) => sum + n.pending_count, 0);

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
              {unreadAcceptedCount > 0 && notifOpen !== 'accepted' && (
                <button type="button" className="notification-badge" onClick={openAcceptedNotifications}>
                  Accepted!
                </button>
              )}
              {pendingNotifs.length > 0 && notifOpen !== 'pending' && (
                <button
                  type="button"
                  className="notification-badge pending"
                  onClick={openPendingNotifications}
                  title="Suggestions awaiting your review"
                >
                  {totalPending} pending review{totalPending === 1 ? '' : 's'}
                </button>
              )}
              {notifOpen === 'accepted' && (
                <div className="notification-popover">
                  <div className="notification-popover-header">Your suggestions were accepted</div>
                  <ul>
                    {suggestionNotifs.length === 0 ? (
                      <li className="notification-empty">Nothing new right now.</li>
                    ) : (
                      suggestionNotifs.map((notif) => (
                        <li key={notif.template_id}>
                          <Link href={`/templates/${notif.template_id}`}>{notif.template_name}</Link>
                        </li>
                      ))
                    )}
                  </ul>
                  <button type="button" className="button small secondary" onClick={closeNotifications}>
                    Close
                  </button>
                </div>
              )}
              {notifOpen === 'pending' && (
                <div className="notification-popover">
                  <div className="notification-popover-header">Suggestions awaiting your review</div>
                  <ul>
                    {pendingNotifs.length === 0 ? (
                      <li className="notification-empty">Nothing pending right now.</li>
                    ) : (
                      pendingNotifs.map((notif) => (
                        <li key={notif.template_id}>
                          <Link href={`/templates/${notif.template_id}/edit`}>
                            {notif.template_name}
                            {notif.pending_count > 1 && (
                              <span className="notification-count"> ({notif.pending_count})</span>
                            )}
                          </Link>
                        </li>
                      ))
                    )}
                  </ul>
                  <button type="button" className="button small secondary" onClick={closeNotifications}>
                    Close
                  </button>
                </div>
              )}
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
