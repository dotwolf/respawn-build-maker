# Respawn Build Maker
Respawn is a build planner for any RPG. Create a Builder that defines a game's stats, items, equipment slots, and level rules, then create, share, and vote on Builds inside it.

A platform for creating, sharing, and voting on RPG character builds for any game.

The core idea is a two-layer model: a **Builder** defines the rules and items of a specific game, and **Builds** are character configurations made within that Builder. Anyone can create a Builder for any game, keep it updated as the game changes, and let the community submit and vote on Builds inside it.

---

## Concepts

**Builder** - the schema for a game. The creator defines stats, equipment slots, item pools, level-up rules, class modifiers, and component categories (Runes, Enchantments, Jewels, etc.). Think of it as the rulebook.

**Build** - a character configuration inside a Builder: which items are equipped, at what level/tier, with which components socketed, and how stat points are spent. Builds can be kept private or shared publicly for community voting.

When a Builder is updated — a weapon nerfed, an item added or edited — all Builds built from it update automatically. Stat recalculations happen at read time; no sync jobs needed. If an item is removed entirely, affected Builds are flagged as outdated rather than silently broken.

No account is required. You can create Builders and Builds locally in your browser and migrate to an account when you want to share.

---

## Stack

| Layer    | Technology           |
|----------|----------------------|
| Frontend | Next.js              |
| Backend  | Go                   |
| Database | PostgreSQL           |
| Auth     | JWT                  |
| Local    | IndexedDB            |
