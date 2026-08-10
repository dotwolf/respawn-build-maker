'use client';

import Link from 'next/link';
import { ChevronDown, ChevronUp, Copy, Eye, Trash2, User } from 'lucide-react';
import type { BuildListItem } from '../lib/builds';
import { formatDate } from '../lib/builds';

interface BuildCardProps {
  build: BuildListItem;
  rank?: number;
  votable?: boolean;
  onVote?: (build: BuildListItem, value: 1 | -1) => void;
  myVotes?: Record<string, 1 | -1>;
  onOpen?: (build: BuildListItem) => void;
  onDuplicate?: (build: BuildListItem) => void;
  onDelete?: (build: BuildListItem) => void;
  hideCreator?: boolean;
  hideScore?: boolean;
}

export default function BuildCard({
  build,
  rank,
  votable,
  onVote,
  myVotes,
  onOpen,
  onDuplicate,
  onDelete,
  hideCreator,
  hideScore,
}: BuildCardProps) {
  const creator = build.creator_username || `User #${build.creator_user_id}`;
  const posted = formatDate(build.created_at);
  const edited =
    build.updated_at && build.updated_at !== build.created_at ? formatDate(build.updated_at) : null;
  const myVote = myVotes?.[build.id];
  const clickable = Boolean(onOpen);

  return (
    <article
      className={`optimizer-result build-card${hideScore ? ' no-score' : ''}`}
      onClick={clickable ? () => onOpen?.(build) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen?.(build);
              }
            }
          : undefined
      }
    >
      <div className="optimizer-result-rank">{rank != null ? `#${rank}` : ''}</div>
      {!hideScore && (
        <div className="optimizer-result-grade build-card-score">
          {votable && onVote && (
            <button
              type="button"
              className={`vote-btn like${myVote === 1 ? ' active' : ''}`}
              aria-label="Like build"
              aria-pressed={myVote === 1}
              title={myVote === 1 ? 'Remove your like' : 'Like build'}
              onClick={(e) => {
                e.stopPropagation();
                onVote(build, 1);
              }}
            >
              <ChevronUp size={14} />
            </button>
          )}
          <strong>{build.vote_score ?? 0}</strong>
          <span>likes</span>
          {votable && onVote && (
            <button
              type="button"
              className={`vote-btn dislike${myVote === -1 ? ' active' : ''}`}
              aria-label="Dislike build"
              aria-pressed={myVote === -1}
              title={myVote === -1 ? 'Remove your dislike' : 'Dislike build'}
              onClick={(e) => {
                e.stopPropagation();
                onVote(build, -1);
              }}
            >
              <ChevronDown size={14} />
            </button>
          )}
        </div>
      )}
      <div className="build-card-info">
        <h4>{build.name || 'Untitled build'}</h4>
        {build.description && <p className="build-card-desc">{build.description}</p>}
        <div className="build-card-meta">
          <span className="badge accent">
            {build.template_name || (build.template_id ? `Template ${build.template_id}` : 'Template')}
          </span>
          {!hideCreator && (
            <span className="badge">
              <User size={12} /> {creator}
            </span>
          )}
          {posted && <span className="badge">Posted {posted}</span>}
          {edited && <span className="badge">Edited {edited}</span>}
        </div>
        {Array.isArray(build.tags) && build.tags.length > 0 && (
          <div className="slot-categories build-card-tags">
            {build.tags.map((tag) => (
              <span key={tag} className="slot-pill">{tag}</span>
            ))}
          </div>
        )}
      </div>
      <div className="build-card-actions">
        {build.template_id && (
          <Link
            href={`/templates/${encodeURIComponent(build.template_id)}/builds/${encodeURIComponent(build.id)}`}
            className="optimizer-result-apply"
            onClick={(e) => e.stopPropagation()}
          >
            <Eye size={14} /> View
          </Link>
        )}
        {onDelete && (
          <button
            type="button"
            className="optimizer-result-save delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(build);
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>
    </article>
  );
}
