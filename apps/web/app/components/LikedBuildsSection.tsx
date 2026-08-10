'use client';

import { Heart, Loader2 } from 'lucide-react';
import BuildCard from './BuildCard';
import type { BuildListItem } from '../lib/builds';

interface LikedBuildsSectionProps {
  builds: BuildListItem[];
  loading: boolean;
  onOpen: (build: BuildListItem) => void;
  onDuplicate: (build: BuildListItem) => void;
}

export default function LikedBuildsSection({ builds, loading, onOpen, onDuplicate }: LikedBuildsSectionProps) {
  return (
    <section className="card" style={{ padding: '1.5rem' }}>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2>Liked Builds</h2>
          <p className="panel-subtitle">Builds you liked from the community.</p>
        </div>
      </div>

      <p className="filter-result-count" style={{ marginTop: '.75rem' }}>
        {loading ? 'Loading builds...' : `${builds.length} liked build${builds.length === 1 ? '' : 's'}`}
      </p>

      {loading ? (
        <p className="loading-placeholder">
          <Loader2 size={16} className="spin" /> Fetching liked builds...
        </p>
      ) : builds.length === 0 ? (
        <div className="empty-state-card">
          <Heart size={28} style={{ margin: '0 auto .5rem', opacity: 0.6 }} />
          <p style={{ margin: 0 }}>
            No liked builds yet. Like a build from its detail page to keep it here.
          </p>
        </div>
      ) : (
        <div className="optimizer-results-list" style={{ marginTop: '1rem' }}>
          {builds.map((build, index) => (
            <BuildCard
              key={build.id}
              build={build}
              rank={index + 1}
              onOpen={onOpen}
              onDuplicate={onDuplicate}
            />
          ))}
        </div>
      )}
    </section>
  );
}
