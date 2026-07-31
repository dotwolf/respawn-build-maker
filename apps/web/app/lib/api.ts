const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';
const authStorageKey = 'respawn-auth';

interface ApiFetchInit extends RequestInit {
  body?: string;
}

export async function apiFetch(path: string, init?: ApiFetchInit) {
  const url = `${apiBase}${path}`;
  const headers = new Headers(init?.headers as HeadersInit);
  headers.set('Content-Type', 'application/json');

  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(authStorageKey);
    if (stored) {
      try {
        const auth = JSON.parse(stored) as { token?: string };
        if (auth?.token) {
          headers.set('Authorization', `Bearer ${auth.token}`);
        }
      } catch {
        // ignore malformed auth state
      }
    }
  }

  const response = await fetch(url, {
    ...init,
    headers,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error || response.statusText || 'API request failed';
    throw new Error(message);
  }

  return payload;
}
