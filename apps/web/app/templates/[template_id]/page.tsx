'use client';

import { useParams } from 'next/navigation';
import { TemplateEditor } from '../new/TemplateEditor';

export default function TemplateDetailPage() {
  const params = useParams();
  const templateId = params.template_id as string;
  return <TemplateEditor templateId={templateId} mode="view" />;
}
