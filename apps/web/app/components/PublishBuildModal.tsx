'use client';

import { createPortal } from 'react-dom';
import { useState } from 'react';
import { Globe, Loader2, Lock, X } from 'lucide-react';

interface PublishBuildModalProps {
  buildName: string;
  publishing: boolean;
  onClose: () => void;
  onPublish: (isPublic: boolean) => void;
}

export default function PublishBuildModal({
  buildName,
  publishing,
  onClose,
  onPublish,
}: PublishBuildModalProps) {
  const [isPublic, setIsPublic] = useState(true);

  return createPortal(
    <div className="modal-overlay" onClick={() => (publishing ? null : onClose())}>
      <div
        className="modal-content"
        style={{ maxWidth: 460, padding: '1.5rem' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Publish build"
      >
        <div className="modal-actions-bar">
          <h3 style={{ margin: 0 }}>Publish build</h3>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close publish dialog"
            disabled={publishing}
          >
            <X size={18} />
          </button>
        </div>

        <p className="panel-subtitle" style={{ marginTop: '1rem' }}>
          Publishing <strong>{buildName}</strong>. Who should be able to see it?
        </p>

        <div style={{ display: 'grid', gap: '.75rem', marginTop: '1rem' }}>
          <button
            type="button"
            className={`publish-choice${isPublic ? ' selected' : ''}`}
            onClick={() => setIsPublic(true)}
            disabled={publishing}
          >
            <Globe size={18} />
            <span>
              <strong>Public</strong>
              <small>Anyone can view this build.</small>
            </span>
          </button>
          <button
            type="button"
            className={`publish-choice${!isPublic ? ' selected' : ''}`}
            onClick={() => setIsPublic(false)}
            disabled={publishing}
          >
            <Lock size={18} />
            <span>
              <strong>Private</strong>
              <small>Only you can see this build.</small>
            </span>
          </button>
        </div>

        <div
          className="modal-footer"
          style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}
        >
          <button className="button secondary" type="button" onClick={onClose} disabled={publishing}>
            Cancel
          </button>
          <button className="button" type="button" onClick={() => onPublish(isPublic)} disabled={publishing}>
            {publishing ? <Loader2 size={16} className="spin" /> : <Globe size={16} />} Publish
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
