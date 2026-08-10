'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function TemplateBuildsRedirect() {
  const params = useParams();
  const router = useRouter();
  const templateId = params.template_id as string;

  useEffect(() => {
    if (templateId) {
      router.replace(`/builds?template=${encodeURIComponent(templateId)}`);
    }
  }, [templateId, router]);

  return null;
}
