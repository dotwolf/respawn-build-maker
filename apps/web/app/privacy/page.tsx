import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Respawn Build Maker handles your information.',
};

const CONTACT_EMAIL = 'joaogwolf@gmail.com';
const EFFECTIVE_DATE = 'August 10, 2026';

export default function PrivacyPolicyPage() {
  return (
    <main className="content-narrow">
      <section className="card legal-card" style={{ padding: '2rem' }}>
        <h1>Privacy Policy</h1>
        <p>Last updated: {EFFECTIVE_DATE}</p>

        <p>
          This page explains what Respawn Build Maker collects, why, and what you can do about it.
          We collect as little as possible, we don&apos;t sell your data, and
          you can delete everything tied to your account.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account info:</strong> username, email, and a password (stored only as a
            one-way hash, we can&apos;t read it).
          </li>
          <li>
            <strong>Google sign-in:</strong> if you sign in with Google, we get your email, your
            Google account ID, and your name (used only to suggest a username).
          </li>
          <li>
            <strong>Content you create:</strong> templates, builds, votes, and suggestions, stored
            under your username.
          </li>
          <li>
            <strong>Technical data:</strong> IP addresses used briefly for rate limiting and
            brute-force protection.
          </li>
        </ul>

        <p>
          We do not use analytics or tracking cookies. Your sign-in token lives in your
          browser&apos;s localStorage and expires after 24 hours. Builds you save locally with the
          optimizer stay in your browser&apos;s IndexedDB and are never sent to our servers.
        </p>

        <h2>What&apos;s public</h2>
        <p>
          This is a community site: your username, public templates, and public published builds are visible to
          everyone. Your email and password are never public.
        </p>

        <h2>What we share</h2>
        <p>
          We share data only with the services that run the site (hosting
          and database providers) and with Google when you sign in with Google. Google&apos;s
          script runs in your browser and their privacy policy applies to it. Our use of data from
          Google sign-in follows the{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>

        <h2>Deleting your data</h2>
        <p>
          Delete your account from your Profile page and your account, templates, builds, votes,
          and suggestions are removed. Local browser builds stay on your device until you delete
          them.
        </p>

        <h2>Questions</h2>
        <p>
          The project creator's email is <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </main>
  );
}
