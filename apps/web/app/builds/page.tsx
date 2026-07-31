'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function BuildsPage() {
  const [templateId, setTemplateId] = useState('');
  const router = useRouter();

  const goToTemplateBuilds = () => {
    if (!templateId.trim()) return;
    router.push(`/templates/${encodeURIComponent(templateId.trim())}/builds`);
  };

  return (
    <main className="card">
      <div className="page-header">
        <div>
          <h1>Builds</h1>
          <p>View and manage your builds here. To create a new build, access a Template and press "Create New Build"!</p>
          <p>Warning: Users without account can only save their builds locally or export them.</p>
        </div>
        <div className="page-actions">
          <Link href="/builds/template" className="button secondary">
            Find by template
          </Link>
        </div>
      </div>

      <div className="form-grid">
        <label>
          Template ID
          <input value={templateId} onChange={(event) => setTemplateId(event.target.value)} placeholder="Template ID" />
        </label>
      </div>

      <button className="button" type="button" onClick={goToTemplateBuilds}>
        View builds for template
      </button>

      <p className="hint">
        If you know a template ID, use it here. Or use the template detail and build list pages for full workflow.
      </p>
    </main>
  );
}
