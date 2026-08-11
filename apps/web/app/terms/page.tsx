import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The ground rules for using Respawn Build Maker.',
};

const CONTACT_EMAIL = 'joaogwolf@gmail.com';
const EFFECTIVE_DATE = 'August 10, 2026';

export default function TermsOfServicePage() {
  return (
    <main className="content-narrow">
      <section className="card legal-card" style={{ padding: '2rem' }}>
        <h1>Terms of Service</h1>
        <p>Last updated: {EFFECTIVE_DATE}</p>

        <p>
          Respawn Build Maker is a small project for creating and sharing RPG character builds. By
          using it you agree to these terms:
        </p>

        <h2>Your account</h2>
        <p>
          Keep your login to yourself and make sure what you post is accurate. You can delete your
          account anytime from your Profile page.
        </p>

        <h2>What you can&apos;t do</h2>
        <ul>
          <li>Post illegal, abusive, or harassing content.</li>
          <li>Impersonate someone or post content you don&apos;t have the rights to.</li>
          <li>Break into or disrupt the site, scrape it aggressively, or try to harm other users.</li>
        </ul>

        <h2>Your content</h2>
        <p>
          You own what you post. By posting it, you give us permission to store and display it on
          the site. We may remove anything that breaks these terms.
        </p>

        <h2>No warranty, limited liability</h2>
        <p>
          The site is provided &quot;as is.&quot; We don&apos;t guarantee it&apos;ll always work,
          and we&apos;re not liable for anything that goes wrong while you use it.
        </p>

        <h2>Questions</h2>
        <p>
          The project creator's email is <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </main>
  );
}
