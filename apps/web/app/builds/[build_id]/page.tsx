import Link from 'next/link';

export default function BuildDetailsPlaceholder() {
  return (
    <main className="card">
      <div className="page-header">
        <div>
          <h1>Build details</h1>
          <p>
            Builds are loaded through the template-specific route <code>/templates/[template_id]/builds/[build_id]</code>.
          </p>
        </div>
      </div>
      <p>If you have a template ID, visit a template's build list page and follow its build links.</p>
      <Link href="/templates" className="button secondary">
        Browse templates
      </Link>
    </main>
  );
}
