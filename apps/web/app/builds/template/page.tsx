'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LegacyTemplateBuildsRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/builds');
  }, [router]);

  return null;
}
