'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bookmark } from 'lucide-react';
import { deleteLocalBuild, listLocalBuilds } from '../lib/localBuilds';
import type { LocalBuild } from '../lib/localBuilds';
import { useNotification } from './NotificationProvider';
import BuildDrawer from './BuildDrawer';
import BuildCard from './BuildCard';
import type { BuildListItem } from '../lib/builds';

interface LocalBuildsSectionProps {
  emptyMessage?: string;
  onDuplicate?: (build: BuildListItem) => void;
}

function toBuildListItem(build: LocalBuild): BuildListItem {
  return {
    id: build.id,
    name: build.name,
    description: build.description,
    creator_user_id: 0,
    template_id: build.template_id ?? '',
    template_name: build.template_name,
    created_at: build.created_at,
    updated_at: build.updated_at,
    tags: build.tags ?? [],
    vote_score: 0,
    components: {
      slots: Object.entries(build.build.entries ?? {}).map(([slotName, entry]) => ({
        slot_name: slotName,
        component: entry.component,
        tier: entry.tier,
      })),
      slot_levels: build.build.slotLevels ?? {},
      slot_distribution: build.build.slotDistribution ?? {},
    },
  };
}

export default function LocalBuildsSection({ emptyMessage, onDuplicate }: LocalBuildsSectionProps) {
  const { notify } = useNotification();
  const [builds, setBuilds] = useState<LocalBuild[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<LocalBuild | null>(null);

  const reload = useCallback(() => {
    listLocalBuilds()
      .then(setBuilds)
      .catch(() => setBuilds([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleDelete = async (build: { id: string; name: string }) => {
    if (!window.confirm(`Delete "${build.name}"? This cannot be undone.`)) return;
    try {
      await deleteLocalBuild(build.id);
      setBuilds((prev) => prev.filter((b) => b.id !== build.id));
      setDetail((prev) => (prev?.id === build.id ? null : prev));
      notify('Build removed from My Builds.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not delete build.', 'error');
    }
  };

  const openDetails = (build: BuildListItem) => {
    const local = builds.find((b) => b.id === build.id);
    if (local?.template_id) setDetail(local);
  };

  return (
    <section className="card" style={{ padding: '1.5rem' }}>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2>My Builds</h2>
          <p className="panel-subtitle">
            Builds you saved locally in this browser.
          </p>
        </div>
      </div>

      <p className="filter-result-count" style={{ marginTop: '.75rem' }}>
        {loading ? 'Loading builds...' : `${builds.length} build${builds.length === 1 ? '' : 's'} saved`}
      </p>

      {loading ? (
        <p className="loading-placeholder">Reading saved builds...</p>
      ) : builds.length === 0 ? (
        <div className="empty-state-card">
          <Bookmark size={28} style={{ margin: '0 auto .5rem', opacity: 0.6 }} />
          <p style={{ margin: 0 }}>
            {emptyMessage ||
              'No locally saved builds yet. Generate a build with the optimizer and press Save to keep it here.'}
          </p>
        </div>
      ) : (
        <div className="optimizer-results-list" style={{ marginTop: '1rem' }}>
          {builds.map((build, index) => (
            <BuildCard
              key={build.id}
              build={toBuildListItem(build)}
              rank={index + 1}
              votable={false}
              hideCreator
              hideScore
              onOpen={openDetails}
              onDuplicate={onDuplicate}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {detail && (
        <BuildDrawer
          build={toBuildListItem(detail)}
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
