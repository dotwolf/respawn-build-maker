-- +goose Up
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'templates'
          AND column_name = 'component_pool'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'templates'
          AND column_name = 'components'
    ) THEN
        ALTER TABLE templates RENAME COLUMN component_pool TO components;
    END IF;
END
$$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'templates'
          AND column_name = 'components'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'templates'
          AND column_name = 'component_pool'
    ) THEN
        ALTER TABLE templates RENAME COLUMN components TO component_pool;
    END IF;
END
$$;
-- +goose StatementEnd
