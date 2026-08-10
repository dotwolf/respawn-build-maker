-- +goose Up
ALTER TABLE templates ADD COLUMN allow_suggestions BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE template_suggestions (
    id VARCHAR(255) PRIMARY KEY,
    template_id VARCHAR(255) NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    description TEXT,
    components JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
    author_notified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_template_suggestions_template ON template_suggestions(template_id);
CREATE INDEX idx_template_suggestions_author ON template_suggestions(author_user_id);

-- +goose Down
DROP INDEX IF EXISTS idx_template_suggestions_author;
DROP INDEX IF EXISTS idx_template_suggestions_template;
DROP TABLE IF EXISTS template_suggestions;
ALTER TABLE templates DROP COLUMN IF EXISTS allow_suggestions;
