interface TemplateBasicsStepProps {
  name: string;
  setName: (name: string) => void;
  description: string;
  setDescription: (description: string) => void;
  isPrivate: boolean;
  setIsPrivate: (isPrivate: boolean) => void;
  stats: string[];
}

export default function TemplateBasicsStep({
  name,
  setName,
  description,
  setDescription,
  isPrivate,
  setIsPrivate,
  stats,
}: TemplateBasicsStepProps) {
  return (
    <section className="rules-section">
      <label>
        <strong>Name<span style={{ color: 'red' }}>*</span></strong>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name"
        />
      </label>

      <label>
        <strong>Description</strong>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="Describe the purpose of this template"
        />
      </label>

      <div className="stats-display-container">
        <strong>Stats</strong>
        {stats.length > 0 ? (
          <p className="stats-text">{stats.join(', ')}</p>
        ) : (
          <p className="no-stats-text">No stats defined in components yet.</p>
        )}
      </div>

      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
        />
        <span><strong>Private</strong> Only you can see and use this template.</span>
      </label>
    </section>
  );
}