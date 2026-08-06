-- +goose Up
ALTER TABLE users
    ADD COLUMN google_sub VARCHAR(255);

CREATE UNIQUE INDEX idx_users_google_sub ON users(google_sub);

-- +goose Down
DROP INDEX IF EXISTS idx_users_google_sub;

ALTER TABLE users
    DROP COLUMN IF EXISTS google_sub;
