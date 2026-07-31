"use client";

import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useNotification } from '../components/NotificationProvider';

type AuthState = {
  token: string;
  user: {
    id: number;
    username: string;
    email?: string;
  };
};

const authStorageKey = 'respawn-auth';

export default function ProfilePage() {
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [result, setResult] = useState<any>(null);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const { notify } = useNotification();
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

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

  const handleRegister = async () => {
    try {
      const payload = {
        username: registerUsername,
        email: registerEmail,
        password: registerPassword,
      };
      const response = await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setResult(response);
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
      const response = await apiFetch(`/users/${encodeURIComponent(auth.user.id.toString())}`, {
        method: 'DELETE',
      });
      setResult(response);
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

  return (
    <main>
      <section className="card">
        <h1>Profile</h1>
        <p>Manage your account.</p>
      </section>

      {!auth ? (
        <><div className="auth-panels">
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

          <section className="card form-card">
            <h2>Login</h2>
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
        </div>
        </>
      ) : (
        <>
          <section className="card form-card">
            <h2>Account</h2>
            <p>Logged in as <strong>{auth.user.username}</strong></p>
            <div className="page-actions">
              <button className="button secondary" type="button" onClick={handleDelete}>
                Delete my account
              </button>
              <button className="button" type="button" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
