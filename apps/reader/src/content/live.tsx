'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
const base = process.env.NEXT_PUBLIC_DSDOCS_BASE_PATH ?? '/docs';
export function PublishedRefresh({ revision }: { revision: string }) {
  const router = useRouter();
  useEffect(() => {
    let disposed = false,
      running = false;
    const check = async () => {
      if (document.hidden || running) return;
      running = true;
      try {
        const response = await fetch(`${base}/version`, { cache: 'no-store' });
        if (!response.ok) return;
        const current = await response.json();
        if (!disposed && current.revision !== revision) router.refresh();
      } catch {
        /* Keep the current published page during temporary network failure. */
      } finally {
        running = false;
      }
    };
    const timer = setInterval(() => void check(), 5000);
    window.addEventListener('focus', check);
    void check();
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [revision, router]);
  return null;
}
