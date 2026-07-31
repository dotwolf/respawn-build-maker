'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { useNotification } from '../components/NotificationProvider';

export default function TemplatesPage() {
  const [userId, setUserId] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const { notify } = useNotification();

  const handleFetchTemplates = async () => {
    if (!userId.trim()) {
      notify('Enter a creator user ID to list templates.', 'error');
      return;
    }

    try {
      const data = await apiFetch(`/templates?user_id=${encodeURIComponent(userId.trim())}`);
      setTemplates(Array.isArray(data) ? data : []);
      notify('Templates loaded.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Failed to load templates.', 'error');
      setTemplates([]);
    }
  };

  return (
    <main>
      <section className="card">
        <div className="page-header">
          <div>
            <h1>Templates</h1>
            <p>Filter templates or create a new template.</p>
          </div>
          <Link href="/templates/new" className="button secondary">
            New template
          </Link>
        </div>
      </section>

      <section className="card">
        <h2>Template results</h2>
        {templates.length === 0 ? (
          <p>No templates uploaded yet.</p>
        ) : (
          <div className="result-list">
            {templates.map((template) => (
              <article key={template.id} className="result-card">
                <h3>{template.name}</h3>
                <p>ID: {template.id}</p>
                <Link href={`/templates/${template.id}`}>View template</Link>
                <Link href={`/templates/${template.id}/builds`} className="button secondary small">
                  View builds
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
