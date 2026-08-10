'use client';

import { useCallback, useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useNotification } from './NotificationProvider';
import BuildDrawer from './BuildDrawer';
import BuildCard from './BuildCard';
import type { BuildListItem } from '../lib/builds';

interface PublishedBuildsSectionProps {
  refreshKey?: number;
  onDuplicate?: (build: BuildListItem) => void;
}

export default function PublishedBuildsSection({
  refreshKey = 0,
  onDuplicate,
}: PublishedBuildsSectionProps) {
  const { notify } = useNotification();
  const [builds, setBuilds] = useState<BuildListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<BuildListItem | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/builds?limit=100')
      .then((data) => setBuilds(Array.isArray(data) ? data.filter((b) => b != null) : []))
      .catch((error) => {
        notify(error instanceof Error ? error.message : 'Failed to load published builds.', 'error');
        setBuilds([]);
      })
      .finally(() => setLoading(false));
  }, [notify]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  const handleDelete = async (build: BuildListItem) => {
    if (!window.confirm(`Delete "${build.name}"? This cannot be undone.`)) return;
    try {
      await apiFetch(`/builds/${encodeURIComponent(build.id)}`, { method: 'DELETE' });
      setBuilds((prev) => prev.filter((b) => b.id !== build.id));
      setDetail((prev) => (prev?.id === build.id ? null : prev));
      notify('Build deleted.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not delete build.', 'error');
    }
  };

  return (
    <section className="card" style={{ padding: '1.5rem' }}>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2>Published Builds</h2>
          <p className="panel-subtitle">Builds you have published to the community.</p>
        </div>
      </div>

      <p className="filter-result-count" style={{ marginTop: '.75rem' }}>
        {loading ? 'Loading builds...' : `${builds.length} published build${builds.length === 1 ? '' : 's'}`}
      </p>

      {loading ? (
        <p className="loading-placeholder">Fetching your builds...</p>
      ) : builds.length === 0 ? (
        <div className="empty-state-card">
          <Globe size={28} style={{ margin: '0 auto .5rem', opacity: 0.6 }} />
          <p style={{ margin: 0 }}>
            No published builds yet. Build a loadout and press Publish Build to share it.
          </p>
        </div>
      ) : (
        <div className="optimizer-results-list" style={{ marginTop: '1rem' }}>
          {builds.map((build, index) => (
            <BuildCard
              key={build.id}
              build={build}
              rank={index + 1}
              votable={false}
              onOpen={setDetail}
              onDuplicate={(buildToOpen) => {
                setDetail(null);
                onDuplicate?.(buildToOpen);
              }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {detail && (
        <BuildDrawer
          build={detail}
          onClose={() => setDetail(null)}
          onDuplicate={(build) => {
            setDetail(null);
            onDuplicate?.(build);
          }}
        />
      )}
    </section>
  );
}
