'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useNotification } from '../../components/NotificationProvider';

export default function TemplateBuildsPage() {
  const [templateId, setTemplateId] = useState('');
  const [builds, setBuilds] = useState<any[]>([]);
  const { notify } = useNotification();

  const handleLoadBuilds = async () => {
    if (!templateId.trim()) {
      notify('Enter a template ID to load builds.', 'error');
      return;
    }

    try {
      const data = await apiFetch(`/templates/${encodeURIComponent(templateId.trim())}/builds`);
      setBuilds(Array.isArray(data) ? data : []);
      notify(`Loaded ${Array.isArray(data) ? data.length : 0} builds.`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Failed to load builds.', 'error');
    }
  };

  return (
    <main>
      <section className="card page-header">
        <div>
          <h1>Builds by Template</h1>
          <p>Enter a Template ID to fetch its builds through the backend route.</p>
        </div>
      </section>

      <section className="card form-card">
        <label>
          Template ID
          <input value={templateId} onChange={(event) => setTemplateId(event.target.value)} placeholder="Template ID" />
        </label>
        <button className="button" type="button" onClick={handleLoadBuilds}>
          Load builds
        </button>
      </section>

      <section className="card">
        <h2>Result</h2>
        <div className="result-list">
          {builds.map((build) => (
            <div key={build.id} className="result-card">
              <h3>{build.name}</h3>
              <p>ID: {build.id}</p>
              <Link href={`/templates/${templateId}/builds/${build.id}`} className="button small">
                View build
              </Link>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
