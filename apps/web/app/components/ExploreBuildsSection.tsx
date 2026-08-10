'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Compass, Loader2, Search } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useNotification } from './NotificationProvider';
import BuildCard from './BuildCard';
import type { BuildListItem } from '../lib/builds';

type SortOption = 'last' | 'first' | 'liked';

const SORT_LABELS: Record<SortOption, string> = {
  last: 'Last posted',
  first: 'First posted',
  liked: 'Most liked',
};

interface ExploreBuildsSectionProps {
  initialTemplateId?: string;
  likedIds: Set<string>;
  showLikedFilter: boolean;
  votable?: boolean;
  onVoteChanged?: (build: BuildListItem, value: 1 | -1 | null) => void;
  onOpen: (build: BuildListItem) => void;
  onDuplicate: (build: BuildListItem) => void;
}

export default function ExploreBuildsSection({
  initialTemplateId,
  likedIds,
  showLikedFilter,
  votable,
  onVoteChanged,
  onOpen,
  onDuplicate,
}: ExploreBuildsSectionProps) {
  const { notify } = useNotification();
  const [builds, setBuilds] = useState<BuildListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [templateFilter, setTemplateFilter] = useState(initialTemplateId ?? '');
  const [usernameFilter, setUsernameFilter] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [tagsFilter, setTagsFilter] = useState('');
  const [sort, setSort] = useState<SortOption>('last');
  const [likedOnly, setLikedOnly] = useState(false);
  const [myVotes, setMyVotes] = useState<Record<string, 1 | -1>>({});

  useEffect(() => {
    setMyVotes((prev) => {
      const next = { ...prev };
      let changed = false;
      likedIds.forEach((id) => {
        if (next[id] !== 1) {
          next[id] = 1;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [likedIds]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const endpoint = initialTemplateId
      ? `/public/builds?template_id=${encodeURIComponent(initialTemplateId)}&limit=100`
      : '/public/builds?limit=100';

    apiFetch(endpoint)
      .then((data) => {
        if (cancelled) return;
        setBuilds(Array.isArray(data) ? data.filter((b) => b != null) : []);
      })
      .catch((error) => {
        if (cancelled) return;
        notify(error instanceof Error ? error.message : 'Failed to load public builds.', 'error');
        setBuilds([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialTemplateId, notify]);

  useEffect(() => {
    setTemplateFilter(initialTemplateId ?? '');
  }, [initialTemplateId]);

  const filteredBuilds = useMemo(() => {
    const template = templateFilter.trim().toLowerCase();
    const username = usernameFilter.trim().toLowerCase();
    const name = nameFilter.trim().toLowerCase();
    const tags = tagsFilter
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);

    const filtered = builds.filter((build) => {
      if (template) {
        const idMatch = build.template_id.toLowerCase().includes(template);
        const nameMatch = (build.template_name || '').toLowerCase().includes(template);
        if (!idMatch && !nameMatch) return false;
      }
      if (username) {
        const idMatch = String(build.creator_user_id).includes(username);
        const nameMatch = (build.creator_username || '').toLowerCase().includes(username);
        if (!idMatch && !nameMatch) return false;
      }
      if (name && !build.name.toLowerCase().includes(name)) return false;
      if (tags.length > 0) {
        const buildTags = (build.tags || []).map((tag) => tag.toLowerCase());
        if (!tags.every((tag) => buildTags.includes(tag))) return false;
      }
      if (likedOnly && !likedIds.has(build.id)) return false;
      return true;
    });

    const sorted = [...filtered];
    if (sort === 'first') {
      sorted.sort(
        (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
      );
    } else if (sort === 'liked') {
      sorted.sort((a, b) => (b.vote_score ?? 0) - (a.vote_score ?? 0));
    } else {
      sorted.sort(
        (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      );
    }
    return sorted;
  }, [builds, templateFilter, usernameFilter, nameFilter, tagsFilter, sort, likedOnly, likedIds]);

  const hasActiveFilters =
    templateFilter.trim() !== '' ||
    usernameFilter.trim() !== '' ||
    nameFilter.trim() !== '' ||
    tagsFilter.trim() !== '' ||
    sort !== 'last' ||
    likedOnly;

  const handleVote = useCallback(
    (build: BuildListItem, value: 1 | -1) => {
      const removing = myVotes[build.id] === value;
      const request = removing
        ? apiFetch(`/builds/${encodeURIComponent(build.id)}/vote`, { method: 'DELETE' })
        : apiFetch(`/builds/${encodeURIComponent(build.id)}/vote`, {
            method: 'POST',
            body: JSON.stringify({ value }),
          });

      request
        .then((updated) => {
          const score = updated && typeof updated.vote_score === 'number' ? updated.vote_score : undefined;
          if (score !== undefined) {
            setBuilds((prev) =>
              prev.map((b) => (b.id === build.id ? { ...b, vote_score: score } : b))
            );
          }
          setMyVotes((prev) => {
            const next = { ...prev };
            if (removing) delete next[build.id];
            else next[build.id] = value;
            return next;
          });
          onVoteChanged?.(build, removing ? null : value);
        })
        .catch((error) =>
          notify(error instanceof Error ? error.message : 'Failed to update vote.', 'error')
        );
    },
    [myVotes, notify, onVoteChanged]
  );

  return (
    <section className="card" style={{ padding: '1.5rem' }}>
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2>Explore builds</h2>
          <p className="panel-subtitle">Community builds across every public template.</p>
        </div>
        <Link href="/builds" className="button secondary small">
          Clear template filter
        </Link>
      </div>

      <div className="filter-bar" style={{ marginTop: '.5rem' }}>
        <div className="filter-field">
          <label htmlFor="explore-template">Template</label>
          <div style={{ position: 'relative' }}>
            <Search
              size={16}
              style={{ position: 'absolute', left: '.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}
            />
            <input
              id="explore-template"
              type="text"
              placeholder="Template name or ID"
              value={templateFilter}
              onChange={(e) => setTemplateFilter(e.target.value)}
              style={{ paddingLeft: '2.25rem' }}
            />
          </div>
        </div>

        <div className="filter-field" style={{ minWidth: 150, flex: 0 }}>
          <label htmlFor="explore-sort">Sort</label>
          <select id="explore-sort" value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
            {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
              <option key={key} value={key}>{SORT_LABELS[key]}</option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label htmlFor="explore-user">User</label>
          <input
            id="explore-user"
            type="text"
            placeholder="Username"
            value={usernameFilter}
            onChange={(e) => setUsernameFilter(e.target.value)}
          />
        </div>

        <div className="filter-field">
          <label htmlFor="explore-name">Build name</label>
          <input
            id="explore-name"
            type="text"
            placeholder="Build name"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
          />
        </div>

        <div className="filter-field">
          <label htmlFor="explore-tags">Tags</label>
          <input
            id="explore-tags"
            type="text"
            placeholder="tag1, tag2"
            value={tagsFilter}
            onChange={(e) => setTagsFilter(e.target.value)}
          />
        </div>

        {showLikedFilter && (
          <label className="filter-check">
            <input
              type="checkbox"
              checked={likedOnly}
              onChange={(e) => setLikedOnly(e.target.checked)}
            />
            Liked by me
          </label>
        )}
      </div>

      <p className="filter-result-count" style={{ marginTop: '1rem' }}>
        {loading
          ? 'Loading builds...'
          : `${filteredBuilds.length} build${filteredBuilds.length === 1 ? '' : 's'} found`}
      </p>

      {loading ? (
        <p className="loading-placeholder">
          <Loader2 size={16} className="spin" /> Fetching public builds...
        </p>
      ) : filteredBuilds.length === 0 ? (
        <div className="empty-state-card">
          <Compass size={28} style={{ margin: '0 auto .5rem', opacity: 0.6 }} />
          <p style={{ margin: 0 }}>
            {hasActiveFilters
              ? 'No builds match your filters.'
              : 'No public builds yet. Publish a build from the editor to share it here.'}
          </p>
        </div>
      ) : (
        <div className="optimizer-results-list" style={{ marginTop: '1rem' }}>
          {filteredBuilds.map((build, index) => (
            <BuildCard
              key={build.id}
              build={build}
              rank={index + 1}
              votable={votable}
              onVote={handleVote}
              myVotes={myVotes}
              onOpen={onOpen}
              onDuplicate={onDuplicate}
            />
          ))}
        </div>
      )}

      <p className="optimizer-results-tip" style={{ marginTop: '1rem' }}>
        Click a build to open its full breakdown. Duplicate a build to start editing a copy in the editor.
      </p>
    </section>
  );
}
