import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="hero-card">
      <div>
        <h1>Respawn Build Maker</h1>
        <p>Create a Builder that defines a game's stats, items, equipment slots, and level rules, then create, share, and vote on Builds inside it.</p>
        <p>A platform for creating, sharing, and voting on RPG character builds for any game.</p>
      </div>
      <div className="home-actions">
        <Link href="/templates" className="button secondary">
          Templates
        </Link>
        <Link href="/builds" className="button secondary">
          Builds
        </Link>
      </div>
    </main>
  );
}
