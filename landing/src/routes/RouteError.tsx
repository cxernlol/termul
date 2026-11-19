import { buttonClassName } from '../components/ui/Button';
import { usePageMeta } from '../lib/page-meta';

/**
 * Shown when a page throws while it renders. The header and footer stay
 * (this boundary sits inside the App layout), and the reader gets two ways
 * out: reload, or go home.
 */
export function RouteError() {
  usePageMeta({
    title: 'Something broke — Troupe',
    description: 'This page could not load.',
    robots: 'noindex,nofollow',
  });

  return (
    <main id="main-content" className="flex min-h-[60dvh] items-center justify-center px-6 pt-24 pb-24">
      <div className="mx-auto max-w-xl text-center">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">This page could not load</h1>
        <p className="mt-4 text-muted-foreground">
          Part of the page failed while it was opening. Reload to try again. If it fails again, please tell us on GitHub.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          <button type="button" onClick={() => window.location.reload()} className={buttonClassName()}>
            Reload the page
          </button>
          <a href="/" className={buttonClassName({ variant: 'secondary' })}>
            Back to home
          </a>
        </div>
      </div>
    </main>
  );
}
