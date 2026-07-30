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
    creator_user_id,
    created_at,
    updated_at,
    rules,
    component_pool
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
) RETURNING id, name, creator_user_id, created_at, updated_at, rules, component_pool;

-- name: GetTemplateByID :one
SELECT id, name, creator_user_id, created_at, updated_at, rules, component_pool
FROM templates
WHERE id = $1
LIMIT 1;

-- name: ListTemplatesByUser :many
SELECT id, name, creator_user_id, created_at, updated_at, rules, component_pool
FROM templates
WHERE creator_user_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: UpdateTemplate :one
UPDATE templates
SET
    name = COALESCE($1, name),
    updated_at = $2,
    rules = COALESCE($3, rules),
    component_pool = COALESCE($4, component_pool)
WHERE id = $5
RETURNING id, name, creator_user_id, created_at, updated_at, rules, component_pool;

-- name: DeleteTemplate :exec
DELETE FROM templates
WHERE id = $1;

-- name: CreateBuild :one
INSERT INTO builds (
    id,
    name,
    creator_user_id,
    template_id,
    created_at,
    updated_at,
    tags,
    vote_score,
    components
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
) RETURNING id, name, creator_user_id, template_id, created_at, updated_at, tags, vote_score, components;

-- name: GetBuildByID :one
SELECT id, name, creator_user_id, template_id, created_at, updated_at, tags, vote_score, components
FROM builds
WHERE id = $1
LIMIT 1;

-- name: ListBuildsByUser :many
SELECT id, name, creator_user_id, template_id, created_at, updated_at, tags, vote_score, components
FROM builds
WHERE creator_user_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: ListBuildsByTemplate :many
SELECT id, name, creator_user_id, template_id, created_at, updated_at, tags, vote_score, components
FROM builds
WHERE template_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: UpdateBuild :one
UPDATE builds
SET
    name = COALESCE($1, name),
    updated_at = $2,
    tags = COALESCE($3, tags),
    components = COALESCE($4, components)
WHERE id = $5
RETURNING id, name, creator_user_id, template_id, created_at, updated_at, tags, vote_score, components;

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
RETURNING id, name, creator_user_id, template_id, created_at, updated_at, tags, vote_score, components;

-- name: CreateComponent :one
INSERT INTO components (
    id,
    template_id,
    name,
    category,
    effects,
    has_levels,
    level_scaling,
    level_rule,
    is_deleted,
    created_at,
    updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
) RETURNING id, template_id, name, category, effects, has_levels, level_scaling, level_rule, is_deleted, created_at, updated_at;

-- name: GetComponentByID :one
SELECT id, template_id, name, category, effects, has_levels, level_scaling, level_rule, is_deleted, created_at, updated_at
FROM components
WHERE id = $1 AND template_id = $2
LIMIT 1;

-- name: ListComponentsByTemplate :many
SELECT id, template_id, name, category, effects, has_levels, level_scaling, level_rule, is_deleted, created_at, updated_at
FROM components
WHERE template_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: UpdateComponent :one
UPDATE components
SET
    name = COALESCE($1, name),
    category = COALESCE($2, category),
    effects = COALESCE($3, effects),
    has_levels = COALESCE($4, has_levels),
    level_scaling = COALESCE($5, level_scaling),
    level_rule = COALESCE($6, level_rule),
    is_deleted = COALESCE($7, is_deleted),
    updated_at = $8
WHERE id = $9 AND template_id = $10
RETURNING id, template_id, name, category, effects, has_levels, level_scaling, level_rule, is_deleted, created_at, updated_at;

-- name: DeleteComponent :exec
DELETE FROM components
WHERE id = $1 AND template_id = $2;