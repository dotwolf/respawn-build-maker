'use client';

import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, Sparkles, CalendarDays, User, Lock, Shield } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useNotification } from '../components/NotificationProvider';

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

type SortOption = 'newest' | 'oldest' | 'name_asc' | 'name_desc';

const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  name_asc: 'Name A–Z',
  name_desc: 'Name Z–A',
};

function formatDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function TemplatesPage() {
  const [creatorUserId, setCreatorUserId] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { notify } = useNotification();

  const fetchTemplates = async (filterUserId?: string) => {
    setLoading(true);
    try {
      const endpoint = filterUserId?.trim()
        ? `/templates?user_id=${encodeURIComponent(filterUserId.trim())}`
        : '/templates';

      const data = await apiFetch(endpoint);
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Failed to load templates.', 'error');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTemplates(creatorUserId);
    notify(creatorUserId ? 'Filtered templates loaded.' : 'Public templates loaded.', 'success');
  };

  const clearFilters = () => {
    setCreatorUserId('');
    setQuery('');
    setSort('newest');
    fetchTemplates();
  };

  const filteredTemplates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = templates.filter((template) => {
      if (!normalized) return true;
      return (
        template.name.toLowerCase().includes(normalized) ||
        (template.description || '').toLowerCase().includes(normalized) ||
        String(template.creator_user_id).includes(normalized)
      );
    });

    const sorted = [...filtered];
    if (sort === 'newest') {
      sorted.sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
    } else if (sort === 'oldest') {
      sorted.sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime());
    } else {
      sorted.sort((a, b) =>
        sort === 'name_asc'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name)
      );
    }
    return sorted;
  }, [templates, query, sort]);

  const hasActiveFilters = creatorUserId.trim() !== '' || query.trim() !== '' || sort !== 'newest';

  return (
    <main className="content-narrow">
      <section className="card" style={{ padding: '1.5rem' }}>
        <div className="page-header">
          <div>
            <h1>Templates</h1>
            <p className="panel-subtitle">
              Explore community builders or find templates created by a specific user.
            </p>
          </div>
          <Link href="/templates/new" className="button">
            <Plus size={18} /> New template
          </Link>
        </div>

        <form className="filter-bar" onSubmit={handleFilterSubmit} style={{ marginTop: '1.25rem' }}>
          <div className="filter-field">
            <label htmlFor="template-search">Search</label>
            <div style={{ position: 'relative' }}>
              <Search
                size={16}
                style={{ position: 'absolute', left: '.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}
              />
              <input
                id="template-search"
                type="text"
                placeholder="Search by name, description or creator..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                style={{ paddingLeft: '2.25rem' }}
              />
            </div>
          </div>

          <div className="filter-field">
            <label htmlFor="creator-user-id">Creator user ID</label>
            <input
              id="creator-user-id"
              type="text"
              placeholder="e.g. 42"
              value={creatorUserId}
              onChange={(e) => setCreatorUserId(e.target.value)}
            />
          </div>

          <div className="filter-field" style={{ minWidth: 150, flex: 0 }}>
            <label htmlFor="template-sort">Sort</label>
            <select id="template-sort" value={sort} onChange={(e) => setSort(e.target.value as SortOption)}>
              {(Object.keys(SORT_LABELS) as SortOption[]).map((key) => (
                <option key={key} value={key}>{SORT_LABELS[key]}</option>
              ))}
            </select>
          </div>

          <button type="submit" className="button">Filter</button>
          {hasActiveFilters && (
            <button type="button" className="button secondary" onClick={clearFilters}>
              Clear
            </button>
          )}
        </form>
      </section>

      <section className="card" style={{ padding: '1.5rem' }}>
        <div className="page-header" style={{ marginBottom: '1rem' }}>
          <div>
            <h2>Template results</h2>
            <p className="filter-result-count">
              {loading
                ? 'Loading templates...'
                : `${filteredTemplates.length} template${filteredTemplates.length === 1 ? '' : 's'} found`}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="loading-placeholder">Fetching templates...</p>
        ) : filteredTemplates.length === 0 ? (
          <div className="empty-state-card">
            <Shield size={28} style={{ margin: '0 auto .5rem', opacity: 0.6 }} />
            <p style={{ margin: 0 }}>
              {hasActiveFilters
                ? 'No templates match your filters.'
                : 'No templates published yet — be the first to create one.'}
            </p>
          </div>
        ) : (
          <div className="template-grid">
            {filteredTemplates.map((template) => (
              <article key={template.id} className="template-card">
                <div className="template-meta">
                  {template.is_private && (
                    <span className="badge private"><Lock size={12} /> Private</span>
                  )}
                  {Array.isArray(template.stats) && template.stats.length > 0 && (
                    <span className="badge accent">
                      <Sparkles size={12} /> {template.stats.length} stats
                    </span>
                  )}
                </div>
                <h3>{template.name}</h3>
                <p className="template-desc">
                  {template.description || 'No description provided.'}
                </p>

                {Array.isArray(template.stats) && template.stats.length > 0 && (
                  <div className="stats-chips">
                    {template.stats.slice(0, 6).map((stat) => (
                      <span key={stat} className="stat-chip">{stat}</span>
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
                  <span className="badge">
                    <User size={12} /> {template.creator_username || `Creator #${template.creator_user_id}`}
                  </span>
                </div>

                <div className="template-card-actions">
                  <Link href={`/templates/${template.id}`} className="button secondary small">
                    View
                  </Link>
                  <Link href={`/templates/${template.id}/builds`} className="button small">
                    Builds
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
