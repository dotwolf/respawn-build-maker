'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '../../../lib/api';
import { useNotification } from '../../../components/NotificationProvider';

export default function TemplateBuildsPage() {
  const params = useParams();
  const templateId = params.template_id as string;
  const [builds, setBuilds] = useState<any[]>([]);
  const { notify } = useNotification();

  useEffect(() => {
    if (!templateId) {
      notify('Template ID is missing.', 'error');
      return;
    }

    apiFetch(`/templates/${encodeURIComponent(templateId)}/builds`)
      .then((data) => {
        setBuilds(Array.isArray(data) ? data.filter((build) => build != null) : []);
      })
      .catch((error) => {
        notify(error instanceof Error ? error.message : 'Failed to load builds.', 'error');
        setBuilds([]);
      });
  }, [templateId, notify]);

  return (
    <main>
      <section className="card page-header">
        <div>
          <h1>Builds for template</h1>
          <p>View builds created for template <strong>{templateId}</strong>.</p>
        </div>
        <div className="page-actions">
          <Link href={`/templates/${templateId}`} className="button secondary">
            Template details
          </Link>
          <Link href={`/templates/${templateId}/builds/new`} className="button">
            Create build
          </Link>
        </div>
      </section>

      <section className="card">
        {builds.length === 0 ? (
          <p>No builds found for this template.</p>
        ) : (
          <div className="result-list">
            {builds.map((build) => (
              <article key={build.id} className="result-card">
                <h3>{build.name ?? 'Untitled build'}</h3>
                <p>ID: {build.id}</p>
                <p>Score: {build.vote_score ?? 0}</p>
                <Link href={`/templates/${templateId}/builds/${build.id}`} className="button small">
                  View build
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
