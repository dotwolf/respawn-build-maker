'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '../../lib/api';
import { useNotification } from '../../components/NotificationProvider';

export default function TemplateDetailPage() {
  const params = useParams();
  const templateId = params.template_id as string;
  const [template, setTemplate] = useState<any>(null);
  const { notify } = useNotification();

  useEffect(() => {
    if (!templateId) {
      notify('No template selected.', 'error');
      return;
    }

    apiFetch(`/templates/${encodeURIComponent(templateId)}`)
      .then((data) => {
        setTemplate(data);
      })
      .catch((error) => {
        notify(error instanceof Error ? error.message : 'Failed to load template.', 'error');
      });
  }, [templateId, notify]);

  return (
    <main>
      <section className="card page-header">
        <div>
          <h1>Template details</h1>
          <p>Inspect the template payload and navigate to its builds.</p>
        </div>
        <div className="page-actions">
          <Link href="/templates" className="button secondary">
            Templates
          </Link>
          <Link href={`/templates/${templateId}/builds`} className="button">
            View builds
          </Link>
          <Link href={`/templates/${templateId}/builds/new`} className="button secondary">
            New build
          </Link>
        </div>
      </section>

      <section className="card">
        {template && <pre>{JSON.stringify(template, null, 2)}</pre>}
      </section>
    </main>
  );
}
