import { Link } from 'react-router';

import { Logo } from '@/components/ui/Logo';
import {
  CHANGELOG_URL,
  DOCS,
  GITHUB_REPO_URL,
  ISSUES_URL,
  RELEASES_PAGE_URL,
  SECTION,
} from '@/lib/links';

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Download', href: '/#download' },
      { label: 'Features', href: `/#${SECTION.tour}` },
      { label: 'Changelog', href: CHANGELOG_URL },
    ],
  },
  {
    title: 'Docs',
    links: [
      { label: 'Getting started', href: DOCS.gettingStarted },
      { label: 'Agent setup', href: DOCS.agentSetup },
      { label: 'Browser and phone', href: DOCS.remote },
      { label: 'Server API', href: DOCS.serverApi },
    ],
  },
  {
    title: 'Community',
    links: [
      { label: 'GitHub', href: GITHUB_REPO_URL },
      { label: 'Issues', href: ISSUES_URL },
      { label: 'Releases', href: RELEASES_PAGE_URL },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="border-t-[0.5px] border-border bg-card">
      <div className="mx-auto flex max-w-[1248px] flex-col gap-9 px-6 pt-10 pb-12 md:flex-row md:justify-between md:pt-16 xl:px-0">
        <div className="flex flex-col justify-between gap-6 md:gap-20">
          <Logo size={22} />
          <div className="hidden flex-col gap-2 text-[13px] leading-5 text-muted-foreground md:flex">
            <span>usetroupe.dev · MIT License</span>
            <LegalLinks />
          </div>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-8 md:flex md:gap-24">
          {COLUMNS.map((column) => (
            <div key={column.title} className="flex flex-col">
              <h2 className="pb-1 text-[15px] leading-[22px] font-medium text-foreground md:text-sm md:leading-5">{column.title}</h2>
              <ul className="flex flex-col">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="flex min-h-11 items-center text-[15px] text-muted-foreground transition-colors duration-150 hover:text-foreground md:min-h-0 md:py-[5px] md:text-sm md:leading-5"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="flex flex-col gap-2 text-sm leading-5 text-muted-foreground md:hidden">
          <span>usetroupe.dev · MIT License</span>
          <LegalLinks />
        </div>
      </div>
    </footer>
  );
}

function LegalLinks() {
  return (
    <span className="flex gap-3">
      <Link to="/privacy" className="inline-flex min-h-11 items-center hover:text-foreground md:min-h-0">
        Privacy
      </Link>
      <span aria-hidden="true" className="inline-flex items-center">·</span>
      <Link to="/terms" className="inline-flex min-h-11 items-center hover:text-foreground md:min-h-0">
        Terms
      </Link>
    </span>
  );
}
