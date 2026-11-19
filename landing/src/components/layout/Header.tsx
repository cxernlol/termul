import { Menu, MenuContent, MenuItem, MenuTrigger } from '@ui-sdk/react/menu';

import { DownloadCta } from '@/components/download/DownloadCta';
import { buttonClassName } from '@/components/ui/Button';
import { GitHubIcon, MenuIcon } from '@/components/ui/Icons';
import { Logo } from '@/components/ui/Logo';
import { CHANGELOG_URL, DOCS_URL, GITHUB_REPO_URL, SECTION } from '@/lib/links';

const NAV = [
  { label: 'Features', href: `/#${SECTION.tour}` },
  { label: 'Agents', href: `/#${SECTION.agents}` },
  { label: 'Docs', href: DOCS_URL },
  { label: 'Changelog', href: CHANGELOG_URL },
] as const;

export function Header() {
  return (
    <header className="relative z-40 border-b-[0.5px] border-border">
      <div className="mx-auto flex h-14 max-w-[1248px] items-center justify-between pr-3 pl-5 md:px-6 xl:px-0">
        <div className="flex items-center gap-10">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
            {NAV.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="rounded-md text-[13px] leading-5 font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <a href={GITHUB_REPO_URL} className={buttonClassName({ variant: 'ghost', size: 'sm', className: 'text-foreground' })}>
            <GitHubIcon size={14} />
            GitHub
          </a>
          <DownloadCta compact />
        </div>

        <div className="md:hidden">
          <Menu>
            <MenuTrigger
              aria-label="Open menu"
              className="flex size-11 items-center justify-center rounded-[10px] text-foreground outline-hidden focus-ring select-none"
            >
              <MenuIcon />
            </MenuTrigger>
            <MenuContent
              align="end"
              sideOffset={4}
              className="z-50 flex w-56 flex-col rounded-xl bg-popover p-1 shadow-menu outline-none origin-[calc(100%-var(--anchor-width)/2)_0] transition-[opacity,scale] duration-150 ease-(--ease-out) data-starting-style:scale-[0.97] data-starting-style:opacity-0 data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-ending-style:duration-120 motion-reduce:transition-opacity motion-reduce:data-starting-style:scale-100 motion-reduce:data-ending-style:scale-100"
            >
              {[...NAV, { label: 'GitHub', href: GITHUB_REPO_URL }].map((item) => (
                <MenuItem
                  key={item.label}
                  value={item.label}
                  label={item.label}
                  onSelect={() => window.location.assign(item.href)}
                  className="flex min-h-11 items-center rounded-lg px-3 text-[15px] text-foreground outline-none transition-colors duration-150 ease-(--ease-out) data-highlighted:bg-foreground/6"
                >
                  {item.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        </div>
      </div>
    </header>
  );
}
