-- +goose Up
ALTER TABLE components
    ADD COLUMN sub_category VARCHAR(255);

-- +goose Down
ALTER TABLE components
    DROP COLUMN IF EXISTS sub_category;
