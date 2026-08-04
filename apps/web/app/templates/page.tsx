'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { useNotification } from '../components/NotificationProvider';

export default function TemplatesPage() {
  const [userId, setUserId] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const { notify } = useNotification();

  const fetchTemplates = async (filterUserId?: string) => {
    try {
      const endpoint = filterUserId?.trim() 
        ? `/templates?user_id=${encodeURIComponent(filterUserId.trim())}` 
        : '/templates';
      
      const data = await apiFetch(endpoint);
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Failed to load templates.', 'error');
      setTemplates([]);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTemplates(userId);
    notify(userId ? 'Filtered templates loaded.' : 'Public templates loaded.', 'success');
  };

  return (
    <main>
      <section className="card">
        <div className="page-header">
          <div>
            <h1>Templates</h1>
            <p>Explore public templates or filter by a creator user ID.</p>
          </div>
          <Link href="/templates/new" className="button secondary">
            New template
          </Link>
        </div>

        <form onSubmit={handleFilterSubmit} style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="Filter by Creator User ID (Optional)"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ padding: '0.5rem', flex: 1 }}
          />
          <button type="submit" className="button">Filter</button>
          {userId && (
            <button 
              type="button" 
              className="button secondary" 
              onClick={() => { setUserId(''); fetchTemplates(); }}
            >
              Clear
            </button>
          )}
        </form>
      </section>

      <section className="card">
        <h2>Template results</h2>
        {templates.length === 0 ? (
          <p>No templates found.</p>
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