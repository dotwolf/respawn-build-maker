'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import { useNotification } from '../../../../components/NotificationProvider';

export default function NewTemplateBuildPage() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.template_id as string;

  const [name, setName] = useState('');
  const [creatorUserId, setCreatorUserId] = useState('');
  const [tags, setTags] = useState('');
  const [components, setComponents] = useState('{\n  "items": []\n}');
  const { notify } = useNotification();

  const handleCreateBuild = async () => {
    if (!name.trim() || !creatorUserId.trim()) {
      notify('Build name and creator user ID are required.', 'error');
      return;
    }

    try {
      const payload = {
        name: name.trim(),
        creator_user_id: Number(creatorUserId),
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        components: JSON.parse(components),
      };

      const response = await apiFetch(`/templates/${encodeURIComponent(templateId)}/builds`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      notify('Build created successfully.', 'success');
      router.push(`/templates/${templateId}/builds/${response.id}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Build creation failed.', 'error');
    }
  };

  return (
    <main>
      <section className="card page-header">
        <div>
          <h1>Create build</h1>
          <p>Submit a build for template <strong>{templateId}</strong>.</p>
        </div>
        <Link href={`/templates/${templateId}/builds`} className="button secondary">
          Back to builds
        </Link>
      </section>

      <section className="card form-card">
        <label>
          Build name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Build name" />
        </label>
        <label>
          Creator user ID
          <input value={creatorUserId} onChange={(event) => setCreatorUserId(event.target.value)} placeholder="Creator user ID" />
        </label>
        <label>
          Tags (comma-separated)
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="tag1, tag2" />
        </label>
        <label>
          Components JSON
          <textarea value={components} onChange={(event) => setComponents(event.target.value)} rows={8} />
        </label>
        <button className="button" type="button" onClick={handleCreateBuild}>
          Create build
        </button>
      </section>
    </main>
  );
}
