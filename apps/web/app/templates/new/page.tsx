'use client';

import Link from 'next/link';
import { useState } from 'react';
import { apiFetch } from '../../lib/api';
import { useNotification } from '../../components/NotificationProvider';

export default function NewTemplatePage() {
  const [name, setName] = useState('');
  const [creatorUserId, setCreatorUserId] = useState('');
  const [rules, setRules] = useState('{\n  "description": "Example rules"\n}');
  const [componentPool, setComponentPool] = useState('{\n  "items": []\n}');
  const [createdTemplate, setCreatedTemplate] = useState<any>(null);
  const { notify } = useNotification();

  const handleCreateTemplate = async () => {
    if (!name.trim() || !creatorUserId.trim()) {
      notify('Template name and creator user ID are required.', 'error');
      return;
    }

    try {
      const payload = {
        name: name.trim(),
        creator_user_id: Number(creatorUserId),
        rules: JSON.parse(rules),
        component_pool: JSON.parse(componentPool),
      };
      const response = await apiFetch('/templates', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setCreatedTemplate(response);
      notify('Template created successfully.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Template creation failed.', 'error');
    }
  };

  return (
    <main>
      <section className="card">
        <div className="page-header">
          <div>
            <h1>Create Template</h1>
            <p>Create a new template using a creator user ID and JSON payloads.</p>
          </div>
          <Link href="/templates" className="button secondary">
            Back to templates
          </Link>
        </div>
      </section>

      <section className="card form-card">
        <label>
          Template name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Template name" />
        </label>

        <label>
          Creator user ID
          <input value={creatorUserId} onChange={(event) => setCreatorUserId(event.target.value)} placeholder="Creator user ID" />
        </label>

        <label>
          Rules JSON
          <textarea value={rules} onChange={(event) => setRules(event.target.value)} rows={6} />
        </label>

        <label>
          Component pool JSON
          <textarea value={componentPool} onChange={(event) => setComponentPool(event.target.value)} rows={6} />
        </label>

        <button className="button" type="button" onClick={handleCreateTemplate}>
          Create template
        </button>
      </section>

      {createdTemplate && (
        <section className="card">
          <h2>Created template</h2>
          <pre>{JSON.stringify(createdTemplate, null, 2)}</pre>
        </section>
      )}
    </main>
  );
}
