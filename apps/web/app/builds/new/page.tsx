import Link from 'next/link';

export default function NewBuildPage() {
  return (
    <main className="card">
      <div className="page-header">
        <div>
          <h1>Create Build</h1>
          <p>Build creation is handled from a template context.</p>
        </div>
      </div>
      <p>Use a template details page and click "New build" to create a build with the correct template route.</p>
      <Link href="/templates" className="button secondary">
        Browse templates
      </Link>
    </main>
  );
}
