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