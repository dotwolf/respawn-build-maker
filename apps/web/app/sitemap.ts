import type { MetadataRoute } from 'next';
import { SITE_URL } from './lib/site';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080';

interface PublicTemplate {
  id: string;
  name?: string;
  updated_at?: string;
}

interface PublicBuild {
  id: string;
  template_id?: string;
  updated_at?: string;
}

const toDate = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

async function fetchPublic<T>(path: string): Promise<T[]> {
  try {
    const response = await fetch(`${API_BASE}${path}`, { next: { revalidate: 3600 } });
    if (!response.ok) return [];
    const data: unknown = await response.json();
    return Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const lastModified = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/templates`, lastModified, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/builds`, lastModified, changeFrequency: 'daily', priority: 0.8 },
  ];

  const [templates, builds] = await Promise.all([
    fetchPublic<PublicTemplate>('/templates?limit=100'),
    fetchPublic<PublicBuild>('/public/builds?limit=100'),
  ]);

  const templateRoutes: MetadataRoute.Sitemap = templates.map((template) => ({
    url: `${SITE_URL}/templates/${encodeURIComponent(template.id)}`,
    lastModified: toDate(template.updated_at) ?? lastModified,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const buildRoutes: MetadataRoute.Sitemap = builds
    .filter((build) => build.template_id)
    .map((build) => ({
      url: `${SITE_URL}/templates/${encodeURIComponent(build.template_id!)}/builds/${encodeURIComponent(build.id)}`,
      lastModified: toDate(build.updated_at) ?? lastModified,
      changeFrequency: 'weekly',
      priority: 0.5,
    }));

  return [...staticRoutes, ...templateRoutes, ...buildRoutes];
}
