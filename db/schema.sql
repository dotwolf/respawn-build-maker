-- 1. USERS TABLE
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. TEMPLATES TABLE
CREATE TABLE templates (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    creator_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stats JSONB NOT NULL DEFAULT '[]'::jsonb,
    rules JSONB NOT NULL DEFAULT '[]'::jsonb,
    components JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. COMPONENTS TABLE
CREATE TABLE components (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    template_id VARCHAR(255) NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    scoped_number INTEGER NOT NULL, -- Display-only index per template
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sub_category VARCHAR(255),
    category VARCHAR(255) NOT NULL,
    effects JSONB NOT NULL DEFAULT '[]'::jsonb,
    has_levels BOOLEAN NOT NULL DEFAULT FALSE,
    level_scaling VARCHAR(32) CHECK (level_scaling IN ('formula', 'tiers')),
    level_rule JSONB,              -- Min/Max level, formula configs
    tiers JSONB NOT NULL DEFAULT '[]'::jsonb, -- Stores tier levels, tier labels & tier-specific effects
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (template_id, scoped_number)
);

-- 4. BUILDS TABLE
CREATE TABLE builds (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    creator_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id VARCHAR(255) NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,
    tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    vote_score INTEGER NOT NULL DEFAULT 0,
    components JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_private BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. BUILD SLOTS TABLE
CREATE TABLE build_slots (
    build_id VARCHAR(255) NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
    category VARCHAR(255) NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    component_id BIGINT REFERENCES components(id) ON DELETE SET NULL, -- Matched to BIGINT
    level INTEGER,
    tier INTEGER,
    PRIMARY KEY (build_id, category, position)
);

-- 6. BUILD VOTES TABLE
CREATE TABLE build_votes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    build_id VARCHAR(255) NOT NULL REFERENCES builds(id) ON DELETE CASCADE,
    value SMALLINT NOT NULL CHECK (value IN (-1, 1)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, build_id)
);

-- INDEXES FOR OPTIMAL SQLC QUERY PERFORMANCE
CREATE INDEX idx_templates_creator ON templates(creator_user_id);
CREATE INDEX idx_components_template ON components(template_id);
CREATE INDEX idx_builds_template ON builds(template_id);
CREATE INDEX idx_builds_creator ON builds(creator_user_id);
CREATE INDEX idx_build_slots_component ON build_slots(component_id);