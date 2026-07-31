'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '../../../../lib/api';
import { useNotification } from '../../../../components/NotificationProvider';

export default function TemplateBuildDetailPage() {
  const params = useParams();
  const templateId = params.template_id as string;
  const buildId = params.build_id as string;
  const [build, setBuild] = useState<any>(null);
  const { notify } = useNotification();

  useEffect(() => {
    if (!templateId || !buildId) {
      notify('Invalid build route.', 'error');
      return;
    }

    apiFetch(`/templates/${encodeURIComponent(templateId)}/builds/${encodeURIComponent(buildId)}`)
      .then((data) => {
        setBuild(data);
      })
      .catch((error) => {
        notify(error instanceof Error ? error.message : 'Failed to load build.', 'error');
      });
  }, [templateId, buildId, notify]);

  return (
    <main>
      <section className="card page-header">
        <div>
          <h1>Build details</h1>
          <p>
            Build <strong>{buildId}</strong> for template <strong>{templateId}</strong>.
          </p>
        </div>
      </section>

      <section className="card">
        {build && <pre>{JSON.stringify(build, null, 2)}</pre>}
      </section>
    </main>
  );
}
