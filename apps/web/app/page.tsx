'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Swords, Layers, Trophy, ArrowRight, Shield, Sparkles } from 'lucide-react';
import { apiFetch } from './lib/api';

type TemplateSummary = {
  id: string;
  name: string;
  description?: string | null;
  created_at?: string;
  is_private?: boolean;
  stats?: string[];
};

const features = [
  {
    icon: Layers,
    title: 'Build a Builder',
    body: 'Define the stats, items, equipment slots, and level rules that make up your own character builder from scratch.',
  },
  {
    icon: Swords,
    title: 'Craft Builds',
    body: 'Explore templates, fill their equipment slots, and compose powerful character builds against any ruleset you like.',
  },
  {
    icon: Trophy,
    title: 'Share & Vote',
    body: 'Publish your builds, browse what the community created, and vote to surface the strongest or most creative entries.',
  },
];

function formatDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function HomePage() {
  const [recentTemplates, setRecentTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/templates?limit=3')
      .then((data) => setRecentTemplates(Array.isArray(data) ? data : []))
      .catch(() => setRecentTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="content-narrow">
      <section className="hero-card home-hero">
        <div>
          <span className="hero-eyebrow">Builder &amp; Build platform</span>
          <h1>Respawn Build Maker</h1>
          <p className="hero-sub">
            Define a game&apos;s stats, items, equipment slots, and level rules as a reusable
            template — then create, share, and vote on RPG character builds inside it.
          </p>
        </div>

        <div className="hero-actions">
          <Link href="/templates" className="button">
            Explore templates <ArrowRight size={18} />
          </Link>
          <Link href="/profile" className="button secondary">
            Get started
          </Link>
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <strong>{recentTemplates.length}</strong>
            <span>recently added templates</span>
          </div>
          <div className="hero-stat">
            <strong>3</strong>
            <span>core platform features</span>
          </div>
          <div className="hero-stat">
            <strong>1</strong>
            <span>respawn, infinite builds</span>
          </div>
        </div>
      </section>

      <section className="feature-grid">
        {features.map((feature) => (
          <article key={feature.title} className="feature-card">
            <div className="feature-icon">
              <feature.icon size={22} />
            </div>
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
          </article>
        ))}
      </section>

      <section className="card" style={{ padding: '1.5rem' }}>
        <div className="page-header" style={{ marginBottom: '1rem' }}>
          <div>
            <h2>Recently added templates</h2>
            <p className="panel-subtitle">Fresh builders published by the community.</p>
          </div>
          <Link href="/templates" className="button secondary small">
            View all templates
          </Link>
        </div>

        {loading ? (
          <p className="loading-placeholder">Loading templates...</p>
        ) : recentTemplates.length === 0 ? (
          <div className="empty-state-card">
            <Shield size={28} style={{ margin: '0 auto .5rem', opacity: 0.6 }} />
            <p style={{ margin: 0 }}>No templates published yet — be the first to create one.</p>
          </div>
        ) : (
          <div className="template-grid">
            {recentTemplates.map((template) => (
              <article key={template.id} className="template-card">
                <div className="template-meta">
                  {template.is_private && <span className="badge private">Private</span>}
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
