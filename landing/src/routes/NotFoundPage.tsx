import { usePageMeta } from '../lib/page-meta';

import { buttonClassName } from '../components/ui/Button';

export function NotFoundPage() {
  usePageMeta({
    title: 'Page not found — Troupe',
    description: 'The page you are looking for does not exist.',
    robots: 'noindex,nofollow',
  });

  return (
    <main
      id="main-content"
      className="flex min-h-[60dvh] items-center justify-center px-6 pt-24 pb-24"
    >
      <div className="mx-auto max-w-xl text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground">
          Page not found
        </h1>
        <p className="mt-4 text-muted-foreground">
          The page you are looking for does not exist or has moved.
        </p>
        <div className="mt-8 flex justify-center">
          <a href="/" className={buttonClassName()}>
            Back to home
          </a>
        </div>
      </div>
    </main>
  );
}
