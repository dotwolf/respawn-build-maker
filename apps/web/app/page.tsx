'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Swords, Layers, Trophy, ArrowRight, Shield } from 'lucide-react';
import { apiFetch } from './lib/api';

type TemplateSummary = {
  id: string;
  name: string;
  description?: string | null;
  created_at?: string;
  is_private?: boolean;
  stats?: string[];
};

type PlatformStats = {
  templates: number;
  builds: number;
  likes: number;
};

const features = [
  {
    icon: Layers,
    title: 'Build a Template',
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
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCount(value: number) {
  return value.toLocaleString('en-US');
}

export default function HomePage() {
  const [recentTemplates, setRecentTemplates] = useState<TemplateSummary[]>([]);
  const [stats, setStats] = useState<PlatformStats>({ templates: 0, builds: 0, likes: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/stats')
      .then((data) =>
        setStats({
          templates: typeof data?.templates === 'number' ? data.templates : 0,
          builds: typeof data?.builds === 'number' ? data.builds : 0,
          likes: typeof data?.likes === 'number' ? data.likes : 0,
        }),
      )
      .catch(() => {});
    apiFetch('/templates?limit=3')
      .then((data) => setRecentTemplates(Array.isArray(data) ? data : []))
      .catch(() => setRecentTemplates([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="content-narrow">
      <section className="hero-card home-hero">
        <div className="home-hero-grid">
          <div className="home-hero-copy">
            <span className="hero-eyebrow">Builder &amp; Build platform</span>
            <h1>Respawn Build Maker</h1>
            <p className="hero-sub">
              Define a game&apos;s stats, items, equipment slots, and level rules as a reusable
              template, then create, share, and vote on RPG character builds inside it.
            </p>

            <div className="hero-actions">
              <Link href="/templates" className="button">
                Explore templates <ArrowRight size={18} />
              </Link>
              <Link href="/profile" className="button secondary">
                Get started
              </Link>
            </div>
          </div>

          <div className="home-hero-icon">
            <Image
              src="/icon_hr.png"
              alt="Respawn Build Maker logo"
              width={247}
              height={247}
              priority
            />
          </div>
        </div>

        <div className="hero-stats">
          <div className="hero-stat">
            <strong>{formatCount(stats.templates)}</strong>
            <span>templates</span>
          </div>
          <div className="hero-stat">
            <strong>{formatCount(stats.builds)}</strong>
            <span>published builds</span>
          </div>
          <div className="hero-stat">
            <strong>{formatCount(stats.likes)}</strong>
            <span>community likes</span>
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
    </main>
  );
}
