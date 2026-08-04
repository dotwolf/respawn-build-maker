'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useNotification } from '@/app/components/NotificationProvider';
import { apiFetch } from '@/app/lib/api';
import type { Slot, Component, Constraint, Rules, Auth } from '@/app/templates/new/page';
import EditBasicsSection from '../components/EditBasicsSection';
import EditRulesSection from '../components/EditRulesSection';
import EditComponentsSection from '../components/EditComponentsSection';
import Link from 'next/link';

interface TemplateData {
  id: string;
  name: string;
  creator_user_id: number;
  is_private: boolean;
  rules: Rules;
  created_at: string;
  updated_at: string;
}

export default function EditTemplatePage() {
  const router = useRouter();
  const params = useParams();
  const templateId = params.template_id as string;
  const { notify } = useNotification();

  const [isLoading, setIsLoading] = useState(true);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [components, setComponents] = useState<Component[]>([]);

  // Form states
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [constraints, setConstraints] = useState<Constraint[]>([]);

  // Status
  const [basicsStatus, setBasicsStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [rulesStatus, setRulesStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');

  // Check auth and fetch template on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const stored = window.localStorage.getItem('respawn-auth');
    if (!stored) {
      router.replace('/profile');
      return;
    }

    try {
      const parsedAuth = JSON.parse(stored) as Auth;
      setAuth(parsedAuth);
      fetchTemplate(parsedAuth);
    } catch {
      router.replace('/profile');
      return;
    }
  }, []);

  const fetchTemplate = async (auth: Auth) => {
    try {
      const templateData = await apiFetch(`/templates/${templateId}`);
      setTemplate(templateData);
      setName(templateData.name);
      setIsPrivate(templateData.is_private);
      setSlots(templateData.rules.slots);
      setConstraints(templateData.rules.constraints);

      // Check ownership
      if (templateData.creator_user_id !== auth.user.id) {
        notify('You do not have permission to edit this template.', 'error');
        router.replace(`/templates/${templateId}`);
        return;
      }

      // Fetch components
      const componentsList = await apiFetch(`/components?template_id=${templateId}`);
      setComponents(Array.isArray(componentsList) ? componentsList : componentsList.components || []);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Failed to load template', 'error');
      router.replace(`/templates/${templateId}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveBasics = async () => {
    if (!name.trim()) {
      setBasicsStatus('error');
      return;
    }

    try {
      setBasicsStatus('idle');
      await apiFetch(`/templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), is_private: isPrivate }),
      });
      setBasicsStatus('success');
      setTimeout(() => setBasicsStatus('idle'), 3000);
    } catch (error) {
      setBasicsStatus('error');
      setTimeout(() => setBasicsStatus('idle'), 3000);
    }
  };

  const handleSaveRules = async () => {
    if (slots.length === 0) {
      notify('At least one slot must be defined', 'error');
      return;
    }

    try {
      setRulesStatus('idle');
      await apiFetch(`/templates/${templateId}`, {
        method: 'PATCH',
        body: JSON.stringify({ rules: { slots, constraints } }),
      });
      setRulesStatus('success');
      setTimeout(() => setRulesStatus('idle'), 3000);
    } catch (error) {
      setRulesStatus('error');
      setTimeout(() => setRulesStatus('idle'), 3000);
    }
  };

  const handleDeleteTemplate = async () => {
    if (deleteInput !== name) return;

    try {
      await apiFetch(`/templates/${templateId}`, { method: 'DELETE' });
      notify('Template deleted.', 'success');
      router.replace('/templates');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Failed to delete template', 'error');
    }
  };

  if (isLoading || !auth || !template) {
    return <div className="page-header">Loading...</div>;
  }

  const availableCategories = slots.flatMap((s) => s.accepts).filter((v, i, a) => a.indexOf(v) === i).sort();

  return (
    <main>
      <div className="page-header">
        <div>
          <h1>Edit Template: {template.name}</h1>
          <Link href={`/templates/${templateId}`} className="hint">
            ← Back to template
          </Link>
        </div>
      </div>

      {/* Basics Section */}
      <EditBasicsSection
        name={name}
        setName={setName}
        isPrivate={isPrivate}
        setIsPrivate={setIsPrivate}
        onSave={handleSaveBasics}
        status={basicsStatus}
      />

      {/* Rules Section */}
      <EditRulesSection
        slots={slots}
        setSlots={setSlots}
        constraints={constraints}
        setConstraints={setConstraints}
        onSave={handleSaveRules}
        status={rulesStatus}
        availableCategories={availableCategories}
        slotNames={slots.map((s) => s.slot_name).sort()}
      />

      {/* Components Section */}
      <EditComponentsSection
        components={components}
        setComponents={setComponents}
        templateId={templateId}
        availableCategories={availableCategories}
      />

      {/* Danger Zone */}
      <div className="card danger-zone">
        <h2>Danger Zone</h2>
        <p className="hint">
          Deleting a template is permanent. All components will be deleted. Existing builds will be removed.
          You must delete all builds made from this template before deleting it.
        </p>

        {!deleteConfirming && (
          <button type="button" onClick={() => setDeleteConfirming(true)} className="secondary">
            Delete Template
          </button>
        )}

        {deleteConfirming && (
          <div className="delete-confirmation">
            <p>
              Type the template name <strong>{template.name}</strong> to confirm deletion:
            </p>
            <input
              type="text"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder="Type template name..."
            />
            <div className="page-actions">
              <button
                type="button"
                onClick={handleDeleteTemplate}
                disabled={deleteInput !== template.name}
                className="secondary"
              >
                Delete Template
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirming(false);
                  setDeleteInput('');
                }}
                className="secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
