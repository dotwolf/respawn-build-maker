-- name: CreateUser :one
INSERT INTO users (
    username,
    email,
    password,
    created_at,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5
) RETURNING id, username, email, password, created_at, updated_at;

-- name: GetUserByID :one
SELECT id, username, email, password, created_at, updated_at
FROM users
WHERE id = $1
LIMIT 1;

-- name: GetUserByEmail :one
SELECT id, username, email, password, created_at, updated_at
FROM users
WHERE email = $1
LIMIT 1;

-- name: GetUserByUsername :one
SELECT id, username, email, password, created_at, updated_at
FROM users
WHERE username = $1
LIMIT 1;

-- name: ListUsers :many
SELECT id, username, email, created_at, updated_at
FROM users
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: UpdateUser :one
UPDATE users
SET
    username = COALESCE($1, username),
    email = COALESCE($2, email),
    password = COALESCE($3, password),
    updated_at = $4
WHERE id = $5
RETURNING id, username, email, password, created_at, updated_at;

-- name: UpdateUserUsername :one
UPDATE users
SET username = $1, updated_at = $2
WHERE id = $3
RETURNING id, username, email, password, created_at, updated_at;

-- name: UpdateUserEmail :one
UPDATE users
SET email = $1, updated_at = $2
WHERE id = $3
RETURNING id, username, email, password, created_at, updated_at;

-- name: UpdateUserPassword :one
UPDATE users
SET password = $1, updated_at = $2
WHERE id = $3
RETURNING id, username, email, password, created_at, updated_at;

-- name: DeleteUser :exec
DELETE FROM users
WHERE id = $1;

-- name: DeleteUserByEmail :exec
DELETE FROM users
WHERE email = $1;

-- name: UserExists :one
SELECT EXISTS(
    SELECT 1 FROM users WHERE email = $1 OR username = $2
);

-- name: CountUsers :one
SELECT COUNT(*) FROM users;

-- name: GetUsersByIDs :many
SELECT id, username, email, created_at, updated_at
FROM users
WHERE id = ANY($1::int[])
ORDER BY created_at DESC;

-- name: CreateTemplate :one
INSERT INTO templates (
    id,
    name,
    description,
    creator_user_id,
    stats,
    rules,
    components,
    is_private,
    created_at,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
) RETURNING id, name, description, creator_user_id, stats, rules, components, is_private, created_at, updated_at;

-- name: GetTemplateByID :one
SELECT id, name, description, creator_user_id, stats, rules, components, is_private, created_at, updated_at
FROM templates
WHERE id = $1 AND is_private = FALSE
LIMIT 1;

-- name: ListTemplatesByUser :many
SELECT id, name, description, creator_user_id, stats, rules, components, is_private, created_at, updated_at
FROM templates
WHERE creator_user_id = $1 AND is_private = FALSE
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: UpdateTemplate :one
UPDATE templates
SET
    name = $1,
    description = COALESCE($2, description),
    stats = COALESCE($3, stats),
    rules = $4,
    is_private = $5,
    updated_at = $6
WHERE id = $7
RETURNING id, name, description, creator_user_id, stats, rules, components, is_private, created_at, updated_at;

-- name: DeleteTemplate :exec
DELETE FROM templates
WHERE id = $1;

-- name: ListPublicTemplates :many
SELECT id, name, description, creator_user_id, stats, rules, components, is_private, created_at, updated_at
FROM templates
WHERE is_private = FALSE
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;

-- name: CreateBuild :one
INSERT INTO builds (
    id,
    name,
    description,
    creator_user_id,
    template_id,
    created_at,
    updated_at,
    tags,
    vote_score,
    components,
    is_private
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
) RETURNING id, name, description, creator_user_id, template_id, created_at, updated_at, tags, vote_score, components, is_private;

-- name: GetBuildByID :one
SELECT id, name, description, creator_user_id, template_id, created_at, updated_at, tags, vote_score, components, is_private
FROM builds
WHERE id = $1 AND is_private = FALSE
LIMIT 1;

-- name: ListBuildsByUser :many
SELECT id, name, description, creator_user_id, template_id, created_at, updated_at, tags, vote_score, components, is_private
FROM builds
WHERE creator_user_id = $1 AND is_private = FALSE
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: ListBuildsByTemplate :many
SELECT id, name, description, creator_user_id, template_id, created_at, updated_at, tags, vote_score, components, is_private
FROM builds
WHERE template_id = $1 AND is_private = FALSE
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: UpdateBuild :one
UPDATE builds
SET
    name = COALESCE($1, name),
    description = COALESCE($2, description),
    updated_at = $3,
    tags = COALESCE($4, tags),
    components = COALESCE($5, components),
    is_private = COALESCE($6, is_private)
WHERE id = $7
RETURNING id, name, description, creator_user_id, template_id, created_at, updated_at, tags, vote_score, components, is_private;

-- name: DeleteBuild :exec
DELETE FROM builds
WHERE id = $1;

-- name: UpsertBuildVote :one
INSERT INTO build_votes (
    user_id,
    build_id,
    value,
    created_at
) VALUES (
    $1, $2, $3, $4
) ON CONFLICT (user_id, build_id)
DO UPDATE SET
    value = EXCLUDED.value,
    created_at = EXCLUDED.created_at
RETURNING user_id, build_id, value, created_at;

-- name: GetBuildVote :one
SELECT user_id, build_id, value, created_at
FROM build_votes
WHERE user_id = $1 AND build_id = $2
LIMIT 1;

-- name: DeleteBuildVote :exec
DELETE FROM build_votes
WHERE user_id = $1 AND build_id = $2;

-- name: UpdateBuildVoteScore :one
UPDATE builds
SET
    vote_score = $1,
    updated_at = $2
WHERE id = $3
RETURNING id, name, description, creator_user_id, template_id, created_at, updated_at, tags, vote_score, components, is_private;

-- name: CreateComponent :one
INSERT INTO components (
    template_id,
    scoped_number,
    name,
    description,
    sub_category,
    category,
    effects,
    has_levels,
    level_scaling,
    level_rule,
    tiers,
    is_deleted,
    created_at,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
) RETURNING id, template_id, scoped_number, name, description, sub_category, category, effects, has_levels, level_scaling, level_rule, tiers, is_deleted, created_at, updated_at;

-- name: GetComponentByID :one
SELECT id, template_id, scoped_number, name, description, sub_category, category, effects, has_levels, level_scaling, level_rule, tiers, is_deleted, created_at, updated_at
FROM components
WHERE id = $1 AND template_id = $2
LIMIT 1;

-- name: ListComponentsByTemplate :many
SELECT id, template_id, scoped_number, name, description, sub_category, category, effects, has_levels, level_scaling, level_rule, tiers, is_deleted, created_at, updated_at
FROM components
WHERE template_id = $1
ORDER BY scoped_number ASC
LIMIT $2 OFFSET $3;

-- name: UpdateComponent :one
UPDATE components
SET
    name = COALESCE($1, name),
    description = COALESCE($2, description),
    sub_category = COALESCE($3, sub_category),
    category = COALESCE($4, category),
    effects = COALESCE($5, effects),
    has_levels = COALESCE($6, has_levels),
    level_scaling = COALESCE($7, level_scaling),
    level_rule = COALESCE($8, level_rule),
    tiers = COALESCE($9, tiers),
    is_deleted = COALESCE($10, is_deleted),
    updated_at = $11
WHERE id = $12 AND template_id = $13
RETURNING id, template_id, scoped_number, name, description, sub_category, category, effects, has_levels, level_scaling, level_rule, tiers, is_deleted, created_at, updated_at;

-- name: UpsertComponent :one
INSERT INTO components (
    template_id,
    scoped_number,
    name,
    description,
    sub_category,
    category,
    effects,
    has_levels,
    level_scaling,
    level_rule,
    tiers,
    is_deleted,
    created_at,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
) ON CONFLICT (template_id, scoped_number)
DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    sub_category = EXCLUDED.sub_category,
    category = EXCLUDED.category,
    effects = EXCLUDED.effects,
    has_levels = EXCLUDED.has_levels,
    level_scaling = EXCLUDED.level_scaling,
    level_rule = EXCLUDED.level_rule,
    tiers = EXCLUDED.tiers,
    is_deleted = EXCLUDED.is_deleted,
    updated_at = EXCLUDED.updated_at
RETURNING id, template_id, scoped_number, name, description, sub_category, category, effects, has_levels, level_scaling, level_rule, tiers, is_deleted, created_at, updated_at;

-- name: DeleteComponentsByScopedNumbers :exec
DELETE FROM components
WHERE template_id = sqlc.arg('template_id') AND NOT (scoped_number = ANY(sqlc.arg('scoped_numbers')::int[]));

-- name: DeleteComponent :exec
DELETE FROM components
WHERE id = $1 AND template_id = $2;

-- name: UpsertBuildSlot :one
INSERT INTO build_slots (
    build_id,
    category,
    position,
    component_id,
    level,
    tier
) VALUES (
    $1, $2, $3, $4, $5, $6
) ON CONFLICT (build_id, category, position)
DO UPDATE SET
    component_id = EXCLUDED.component_id,
    level = EXCLUDED.level,
    tier = EXCLUDED.tier
RETURNING build_id, category, position, component_id, level, tier;

-- name: ListBuildSlotsByBuild :many
SELECT build_id, category, position, component_id, level, tier
FROM build_slots
WHERE build_id = $1
ORDER BY category, position;

-- name: DeleteBuildSlotsByBuild :exec
DELETE FROM build_slots
WHERE build_id = $1;
