-- +goose Up
-- Compress the heavy JSONB columns with LZ4 (Postgres 14+). Components and
-- templates store thousands of repeated {type, scope, stat, value} effect
-- objects, which compress much better with LZ4 than the default pglz.
ALTER TABLE templates ALTER COLUMN stats SET COMPRESSION lz4;
ALTER TABLE templates ALTER COLUMN rules SET COMPRESSION lz4;
ALTER TABLE components ALTER COLUMN effects SET COMPRESSION lz4;
ALTER TABLE components ALTER COLUMN level_rule SET COMPRESSION lz4;
ALTER TABLE components ALTER COLUMN tiers SET COMPRESSION lz4;

-- Drop the dead templates.components JSONB column. The API never writes real
-- component data there (it is always '[]'::jsonb) and never reads it; the
-- component pool lives entirely in the relational components table.
ALTER TABLE templates DROP COLUMN IF EXISTS components;

-- +goose Down
ALTER TABLE templates ADD COLUMN components JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE templates ALTER COLUMN stats SET COMPRESSION pglz;
ALTER TABLE templates ALTER COLUMN rules SET COMPRESSION pglz;
ALTER TABLE components ALTER COLUMN effects SET COMPRESSION pglz;
ALTER TABLE components ALTER COLUMN level_rule SET COMPRESSION pglz;
ALTER TABLE components ALTER COLUMN tiers SET COMPRESSION pglz;
