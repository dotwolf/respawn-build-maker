'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '../lib/api';
import { useNotification } from '../components/NotificationProvider';
import ExploreBuildsSection from '../components/ExploreBuildsSection';
import BuildDrawer from '../components/BuildDrawer';
import type { BuildListItem } from '../lib/builds';

interface Auth {
  user: { id: number; username?: string; email?: string };
  token: string;
}

function BuildsHub() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { notify } = useNotification();
  const templateFilter = searchParams.get('template') ?? '';

  const [auth, setAuth] = useState<Auth | null>(null);
  const [likedBuilds, setLikedBuilds] = useState<BuildListItem[]>([]);
  const [selectedBuild, setSelectedBuild] = useState<BuildListItem | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem('respawn-auth');
    if (stored) {
      try {
        setAuth(JSON.parse(stored) as Auth);
      } catch {
        window.localStorage.removeItem('respawn-auth');
      }
    }
  }, []);

  const reloadLiked = useCallback(() => {
    apiFetch('/builds/liked?limit=100')
      .then((data) => setLikedBuilds(Array.isArray(data) ? data.filter((b) => b != null) : []))
      .catch((error) => {
        notify(error instanceof Error ? error.message : 'Failed to load liked builds.', 'error');
        setLikedBuilds([]);
      });
  }, [notify]);

  useEffect(() => {
    if (!auth?.token) return;
    reloadLiked();
  }, [auth?.token, reloadLiked]);

  const likedIds = useMemo(() => new Set(likedBuilds.map((b) => b.id)), [likedBuilds]);

  const handleVoteChanged = useCallback(
    (build: BuildListItem, value: 1 | -1 | null) => {
      setLikedBuilds((prev) => {
        if (value === 1) {
          return prev.some((b) => b.id === build.id) ? prev : [...prev, build];
        }
        return prev.filter((b) => b.id !== build.id);
      });
    },
    []
  );

  const handleDuplicate = useCallback(
    (build: BuildListItem) => {
      router.push(`/templates/${encodeURIComponent(build.template_id)}/builds/new?duplicate=${encodeURIComponent(build.id)}`);
    },
    [router]
  );

  return (
    <main className="content-narrow">
      <section className="card" style={{ padding: '1.5rem' }}>
        <div className="page-header">
          <div>
            <h1>Builds</h1>
            <p className="panel-subtitle">
              Manage your saved builds, browse what you liked, and explore builds from the community.
            </p>
            <Link href="/profile" className="button secondary small" style={{ marginTop: '.75rem' }}>
              My builds
            </Link>
          </div>
          <div className="page-actions">
            {!auth && (
              <Link href="/profile" className="button secondary">
                Sign in to publish
              </Link>
            )}
          </div>
        </div>
      </section>

      <ExploreBuildsSection
        initialTemplateId={templateFilter || undefined}
        likedIds={likedIds}
        showLikedFilter={Boolean(auth)}
        votable={Boolean(auth)}
        onVoteChanged={handleVoteChanged}
        onOpen={setSelectedBuild}
        onDuplicate={handleDuplicate}
      />

      {selectedBuild && (
        <BuildDrawer
          build={selectedBuild}
          onClose={() => setSelectedBuild(null)}
          onDuplicate={handleDuplicate}
        />
      )}
    </main>
  );
}

export default function BuildsPage() {
  return (
    <Suspense fallback={null}>
      <BuildsHub />
    </Suspense>
  );
}
