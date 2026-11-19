import { DownloadCta } from '@/components/download/DownloadCta';
import { buttonClassName } from '@/components/ui/Button';
import { GitHubIcon } from '@/components/ui/Icons';
import { GITHUB_REPO_URL } from '@/lib/links';
import { Container } from './Container';

export function Hero() {
  return (
    <section id="download" aria-labelledby="hero-title" className="scroll-mt-6">
      <Container className="pt-12 pb-10 md:pt-[120px] md:pb-[72px]">
        <div className="flex max-w-[680px] flex-col gap-5 md:gap-6">
          {/* Entrance: title, copy, actions, then the shot, 100ms apart (.hero-in, index.css). */}
          <h1
            id="hero-title"
            className="hero-in text-[40px] leading-11 font-medium tracking-[-0.03em] text-foreground md:text-[56px] md:leading-[60px]"
          >
            Any Agents <br className="md:hidden" />
            in One UI
          </h1>
          <p className="hero-in text-base leading-6 text-muted-foreground [--n:1] md:text-lg md:leading-7">
            Run every coding agent from one desktop app. <br className="hidden md:inline" />
            Plan, review and ship with a troupe of agents, from your desk or phone.
          </p>
          <div className="hero-in flex flex-col gap-2.5 pt-2 [--n:2] md:flex-row md:pt-3">
            <DownloadCta />
            <a
              href={GITHUB_REPO_URL}
              className={buttonClassName({
                variant: 'secondary',
                size: 'lg',
                className: 'h-11 w-full px-4 text-base md:w-auto md:px-8 md:text-[15px]',
              })}
            >
              <GitHubIcon size={16} />
              View on GitHub
            </a>
          </div>
          <p className="hero-in text-center text-sm leading-5 text-muted-foreground [--n:2] md:text-left md:text-[13px]">
            Also for Windows and Linux
            <span className="hidden md:inline"> · </span>
            <br className="md:hidden" />
            Free and open source, MIT
          </p>
        </div>
      </Container>
    </section>
  );
}
