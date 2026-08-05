'use client';

import { useParams } from 'next/navigation';
import { TemplateEditor } from '../../new/TemplateEditor';

export default function EditTemplatePage() {
  const params = useParams();
  return <TemplateEditor templateId={params.template_id as string} mode="edit" />;
}
