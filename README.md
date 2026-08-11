# Respawn Build Maker

A build planner for any RPG. Create a **Template** that defines a game's stats, items, equipment slots, and level rules, then craft, publish, share, and vote on **Builds** inside it.

Built for community-driven games: anyone can create a Template for any game, keep it updated as the game changes, and let the community submit, vote on, and suggest improvements to Builds.

---

## Features

- **Templates** — Design a full character builder: stats, equipment slots, item pools, level-up rules, class modifiers, and component categories (Runes, Enchantments, Jewels, etc.).
- **Builds** — Fill a template's slots with items and socketed components, spend stat points, and configure level/tier. Builds can stay private or be published for the community.
- **Live stat recalculation** — When a Template changes, all Builds built from it update automatically. Stats are computed at read time.
- **Voting** — Published builds can be upvoted/downvoted so the strongest or most creative entries float to the top.
- **Suggestions** — Community members can propose edits to a Template; owners review and accept them with in-app notifications.
- **Local-first optimizer** — Save and browse builds entirely in your browser with no account required. Migrate to an account when you want to share.
- **Auth** — Email/password or Google sign-in.

## Tech Stack

| Layer    | Technology |
|----------|------------|
| Frontend | Next.js, React, TypeScript |
| Backend  | Go, Gin, pgx |
| Database | PostgreSQL |
| Migrations | goose (SQL) |
| Auth     | JWT (HS256) + Google Identity Services |
| Local    | IndexedDB, localStorage |

## Repository Layout

```
├── apps/
│   ├── api/                  # Go backend
│   │   ├── cmd/main.go       # Entry point
│   │   ├── migrations/       # goose SQL migrations
│   │   ├── sqlc/             # SQLC config
│   │   └── internal/         # handlers, services, middleware, auth, dto, repository
│   └── web/                  # Next.js frontend
│       └── app/              # App Router pages & components
├── db/schema.sql             # Reference copy of the full schema
├── Dockerfile                # Builds the API container
├── docker-compose.yaml       # Postgres + migrations + API for local dev
├── Makefile                  # Migration helpers
└── go.mod                    # Go workspace (module "main")
```