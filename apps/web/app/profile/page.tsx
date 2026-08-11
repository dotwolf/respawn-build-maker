"use client";

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Plus, Search, Lock, CalendarDays, Pencil, User, LogOut, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { normalizeTemplateStats } from '../lib/stats';
import { useNotification } from '../components/NotificationProvider';
import LocalBuildsSection from '../components/LocalBuildsSection';
import PublishedBuildsSection from '../components/PublishedBuildsSection';

type GoogleCredentialResponse = {
  credential?: string;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: GoogleCredentialResponse) => void;
          }) => void;
          renderButton: (
            el: HTMLElement,
            options: {
              theme?: string;
              size?: string;
              text?: string;
              shape?: string;
              width?: number;
            },
          ) => void;
        };
      };
    };
  }
}

type AuthState = {
  token: string;
  user: {
    id: number;
    username: string;
    email?: string;
  };
};

type TemplateSummary = {
  id: string;
  name: string;
  description?: string | null;
  creator_user_id: number;
  creator_username?: string | null;
  created_at?: string;
  updated_at?: string;
  is_private?: boolean;
  stats?: string[];
};

const authStorageKey = 'respawn-auth';
const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';

function formatDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ProfilePage() {
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [templateCount, setTemplateCount] = useState(0);
  const [publishedCount, setPublishedCount] = useState(0);
  const [likedCount, setLikedCount] = useState(0);
  const [pendingSuggestionCount, setPendingSuggestionCount] = useState(0);
  const [templateQuery, setTemplateQuery] = useState('');
  const [templateSort, setTemplateSort] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const { notify } = useNotification();
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [isUsernameModalOpen, setIsUsernameModalOpen] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(authStorageKey);
    if (stored) {
      try {
        setAuth(JSON.parse(stored));
      } catch {
        window.localStorage.removeItem(authStorageKey);
      }
    }
  }, []);

  const handleGoogleCredential = async (response: GoogleCredentialResponse) => {
    if (!response.credential) {
      notify('Google sign-in did not return a credential.', 'error');
      return;
    }
    try {
      const resp = await apiFetch('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ id_token: response.credential }),
      });
      setAuth(resp as AuthState);
      window.localStorage.setItem(authStorageKey, JSON.stringify(resp));
      notify('Logged in with Google.', 'success');
      if (typeof window !== 'undefined') window.location.reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Google sign-in failed.', 'error');
    }
  };

  useEffect(() => {
    if (auth || !googleClientId) return;

    const initGoogle = () => {
      const el = googleButtonRef.current;
      if (!el || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredential,
      });
      el.innerHTML = '';
      window.google.accounts.id.renderButton(el, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
      });
    };

    if (window.google?.accounts?.id) {
      initGoogle();
      return;
    }

    let script = document.getElementById('gsi-script') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = 'gsi-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', initGoogle);

    return () => {
      script?.removeEventListener('load', initGoogle);
    };
  }, [auth, googleClientId]);

  useEffect(() => {
    if (!auth?.user.id) return;
    const userId = encodeURIComponent(String(auth.user.id));
    setLoadingTemplates(true);
    apiFetch(`/templates?user_id=${userId}&limit=100`)
      .then((data) => setTemplates(Array.isArray(data) ? data : []))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));
    apiFetch(`/templates/count?user_id=${userId}`)
      .then((data) => setTemplateCount(typeof data?.count === 'number' ? data.count : 0))
      .catch(() => setTemplateCount(0));
    apiFetch('/builds/count')
      .then((data) => setPublishedCount(typeof data?.count === 'number' ? data.count : 0))
      .catch(() => setPublishedCount(0));
    apiFetch('/builds/liked/count')
      .then((data) => setLikedCount(typeof data?.count === 'number' ? data.count : 0))
      .catch(() => setLikedCount(0));
    apiFetch('/me/suggestions/count')
      .then((data) => setPendingSuggestionCount(typeof data?.count === 'number' ? data.count : 0))
      .catch(() => setPendingSuggestionCount(0));
  }, [auth?.user.id]);

  const filteredTemplates = useMemo(() => {
    const normalized = templateQuery.trim().toLowerCase();
    const filtered = templates.filter((template) => {
      if (!normalized) return true;
      return (
        template.name.toLowerCase().includes(normalized) ||
        (template.description || '').toLowerCase().includes(normalized)
      );
    });

    const sorted = [...filtered];
    if (templateSort === 'newest') {
      sorted.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    } else if (templateSort === 'oldest') {
      sorted.sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [templates, templateQuery, templateSort]);

  const handleRegister = async () => {
    try {
      const payload = {
        username: registerUsername,
        email: registerEmail,
        password: registerPassword,
      };
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      notify('User registered successfully. Logging you in...', 'success');

      try {
        const loginResp = await apiFetch('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: registerEmail, password: registerPassword }),
        });
        setAuth(loginResp as AuthState);
        window.localStorage.setItem(authStorageKey, JSON.stringify(loginResp));
        notify('Logged in successfully.', 'success');
        if (typeof window !== 'undefined') window.location.reload();
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Auto-login failed', 'error');
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Registration failed.', 'error');
    }
  };

  const handleLogin = async () => {
    try {
      const payload = { email: loginEmail, password: loginPassword };
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setAuth(response as AuthState);
      window.localStorage.setItem(authStorageKey, JSON.stringify(response));
      setLoginEmail('');
      setLoginPassword('');
      notify('Logged in successfully.', 'success');
      if (typeof window !== 'undefined') window.location.reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Login failed.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!auth?.user?.id) {
      notify('Log in before deleting your account.', 'error');
      return;
    }
    try {
      await apiFetch(`/users/${encodeURIComponent(auth.user.id.toString())}`, {
        method: 'DELETE',
      });
      notify('Account deleted.', 'success');
      setAuth(null);
      window.localStorage.removeItem(authStorageKey);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Delete failed.', 'error');
    }
  };

  const handleLogout = () => {
    setAuth(null);
    window.localStorage.removeItem(authStorageKey);
    notify('Logged out.', 'success');
  };

  const openUsernameModal = () => {
    setNewUsername(auth?.user.username ?? '');
    setIsUsernameModalOpen(true);
  };

  const handleUpdateUsername = async () => {
    const next = newUsername.trim();
    if (!next) {
      notify('Enter a username.', 'error');
      return;
    }
    if (next === auth?.user.username) {
      notify('That is already your username.', 'error');
      return;
    }
    try {
      const resp = await apiFetch('/users/me/username', {
        method: 'PUT',
        body: JSON.stringify({ username: next }),
      });
      const updated = {
        ...auth!,
        user: { ...auth!.user, username: resp.username },
      };
      setAuth(updated);
      window.localStorage.setItem(authStorageKey, JSON.stringify(updated));
      setNewUsername('');
      setIsUsernameModalOpen(false);
      notify('Username updated.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not update username.', 'error');
    }
  };

  return (
    <main className="content-narrow">
      {!auth ? (
        <>
          <section className="card auth-hero">
            <h1>Profile</h1>
            <p>
              Sign in to create and edit templates, publish builds, and vote on the community&apos;s
              creations. New here? Register a free account to get started.
            </p>
          </section>

          <div className="auth-panels">
            <section className="card form-card">
              <h2>Login</h2>
              {googleClientId && (
                <>
                  <div
                    ref={googleButtonRef}
                    style={{ display: 'flex', justifyContent: 'center', margin: '.5rem 0 1rem' }}
                  />
                  <div className="auth-divider">
                    <span>or with email</span>
                  </div>
                </>
              )}
              <div className="form-grid">
                <label>
                  Email
                  <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="Email" />
                </label>
                <label>
                  Password
                  <div className="password-field">
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowLoginPassword((v) => !v)}
                      aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                    >
                      {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
              </div>
              <button className="button" type="button" onClick={handleLogin}>
                Sign in
              </button>
            </section>
            <section className="card form-card">
              <h2>Register</h2>
              <div className="form-grid">
                <label>
                  Username
                  <input value={registerUsername} onChange={(e) => setRegisterUsername(e.target.value)} placeholder="Username" />
                </label>
                <label>
                  Email
                  <input value={registerEmail} onChange={(e) => setRegisterEmail(e.target.value)} placeholder="Email" />
                </label>
                <label>
                  Password
                  <div className="password-field">
                    <input
                      type={showRegisterPassword ? 'text' : 'password'}
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      placeholder="Password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowRegisterPassword((v) => !v)}
                      aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}
                    >
                      {showRegisterPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </label>
              </div>
              <button className="button" type="button" onClick={handleRegister}>
                Create user
              </button>
            </section>
          </div>
          <LocalBuildsSection emptyMessage="No locally saved builds yet. Sign in to create templates and publish builds — or save optimizer builds locally in your browser to keep them here." />
        </>
      ) : (
        <>
          <section className="profile-hero">
            <div>
              <h1>{auth.user.username}</h1>
              <p className="sub">
                {auth.user.email ? `Signed in as ${auth.user.email}` : 'Signed in'}
              </p>
            </div>
            <div className="profile-stats">
              <div className="profile-stat">
                <strong>{templateCount}</strong>
                <span>templates</span>
              </div>
              <div className="profile-stat">
                <strong>{publishedCount}</strong>
                <span>builds published</span>
              </div>
              <div className="profile-stat">
                <strong>{likedCount}</strong>
                <span>builds liked</span>
              </div>
              {pendingSuggestionCount > 0 && (
                <div className="profile-stat">
                  <strong className="badge accent">{pendingSuggestionCount}</strong>
                  <span>suggestions to review</span>
                </div>
              )}
            </div>
          </section>

          <LocalBuildsSection />

          <PublishedBuildsSection />

          <section className="card" style={{ padding: '1.5rem' }}>
            <div className="page-header" style={{ marginBottom: '1rem' }}>
              <div>
                <h2>My Templates</h2>
                <p className="panel-subtitle">View or edit templates you created.</p>
              </div>
              <Link href="/templates/new" className="button">
                <Plus size={18} /> New template
              </Link>
            </div>

            <div className="filter-bar">
              <div className="filter-field">
                <label htmlFor="profile-template-search">Search</label>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={16}
                    style={{ position: 'absolute', left: '.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}
                  />
                  <input
                    id="profile-template-search"
                    type="text"
                    placeholder="Search your templates..."
                    value={templateQuery}
                    onChange={(e) => setTemplateQuery(e.target.value)}
                    style={{ paddingLeft: '2.25rem' }}
                  />
                </div>
              </div>

              <div className="filter-field" style={{ minWidth: 150, flex: 0 }}>
                <label htmlFor="profile-template-sort">Sort</label>
                <select
                  id="profile-template-sort"
                  value={templateSort}
                  onChange={(e) => setTemplateSort(e.target.value as typeof templateSort)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Name A–Z</option>
                </select>
              </div>
            </div>

            <p className="filter-result-count" style={{ marginTop: '.75rem' }}>
              {loadingTemplates
                ? 'Loading templates...'
                : `${filteredTemplates.length} template${filteredTemplates.length === 1 ? '' : 's'} found`}
            </p>

            {loadingTemplates ? (
              <p className="loading-placeholder">Fetching your templates...</p>
            ) : filteredTemplates.length === 0 ? (
              <div className="empty-state-card">
                <p style={{ margin: 0 }}>
                  {templateQuery.trim()
                    ? 'No templates match your search.'
                    : 'You have not created any templates yet.'}
                </p>
              </div>
            ) : (
              <div className="template-grid" style={{ marginTop: '1rem' }}>
                {filteredTemplates.map((template) => (
                  <article key={template.id} className="template-card">
                    {template.is_private && (
                      <div className="template-meta">
                        <span className="badge private"><Lock size={12} /> Private</span>
                      </div>
                    )}
                    <h3>{template.name}</h3>
                    <p className="template-desc">
                      {template.description || 'No description provided.'}
                    </p>
                    {Array.isArray(template.stats) && template.stats.length > 0 && (
                      <div className="stats-chips">
                        {normalizeTemplateStats(template.stats).slice(0, 6).map((stat) => (
                          <span key={stat.name} className="stat-chip">{stat.name}</span>
                        ))}
                        {template.stats.length > 6 && (
                          <span className="stat-chip">+{template.stats.length - 6} more</span>
                        )}
                      </div>
                    )}
                    <div className="template-meta">
                      {formatDate(template.created_at) && (
                        <span className="badge">
                          <CalendarDays size={12} /> {formatDate(template.created_at)}
                        </span>
                      )}
                      {template.updated_at &&
                        template.updated_at !== template.created_at &&
                        formatDate(template.updated_at) && (
                          <span className="badge">
                            <Pencil size={12} /> Updated {formatDate(template.updated_at)}
                          </span>
                        )}
                      <span className="badge">
                        <User size={12} /> {template.creator_username || auth?.user.username}
                      </span>
                    </div>
                    <div className="template-card-actions">
                      <Link href={`/templates/${template.id}`} className="button secondary small">
                        View
                      </Link>
                      <Link href={`/templates/${template.id}/edit`} className="button small">
                        Edit
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card form-card" style={{ padding: '1.5rem' }}>
            <h2>Account</h2>
            <p style={{ margin: 0 }}>
              Logged in as <strong>{auth.user.username}</strong>
            </p>
            <div className="page-actions">
              <button className="button secondary" type="button" onClick={openUsernameModal}>
                Change Username
              </button>
              <button className="button secondary" type="button" onClick={handleLogout}>
                <LogOut size={16} /> Sign out
              </button>
              <button className="button danger" type="button" onClick={handleDelete}>
                <Trash2 size={16} /> Delete my account
              </button>
            </div>
          </section>

          {isUsernameModalOpen && (
            <div className="modal-overlay" onClick={() => setIsUsernameModalOpen(false)}>
              <div
                className="modal-content"
                style={{ maxWidth: 440, padding: '1.5rem' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-actions-bar">
                  <h3 style={{ margin: 0 }}>Change username</h3>
                </div>
                <div style={{ marginTop: '1rem' }}>
                  <label>
                    New username
                    <input
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      placeholder="New username"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleUpdateUsername();
                        }
                      }}
                    />
                  </label>
                </div>
                <div
                  className="modal-footer"
                  style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}
                >
                  <button className="button secondary" type="button" onClick={() => setIsUsernameModalOpen(false)}>
                    Cancel
                  </button>
                  <button className="button" type="button" onClick={handleUpdateUsername}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
