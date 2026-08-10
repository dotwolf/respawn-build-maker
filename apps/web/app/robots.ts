import type { MetadataRoute } from 'next';
import { SITE_URL } from './lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/profile', '/templates/new', '/templates/*/edit', '/builds/new', '/builds/template'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
