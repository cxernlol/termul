import type { CSSProperties, ReactNode } from 'react';

import { Composer } from '@/components/app-ui/Composer';
import { AppWindow, Stage, type ShotBackground } from '@/components/app-ui/Window';
import { ConnectorsMenu, SubagentList, WorktreeMenu } from '@/components/bento/parts';
import { cn } from '@/lib/utils';
import { Container } from './Container';

export function Bento() {
  return (
    <section aria-labelledby="bento-title">
      <Container className="flex flex-col gap-4 pt-[72px] md:pt-36">
        <header className="flex flex-col gap-2.5 pb-4 md:items-center md:gap-3 md:pb-10 md:text-center">
          <h2
            id="bento-title"
            className="text-[28px] leading-[34px] font-medium tracking-[-0.02em] text-foreground md:text-[44px] md:leading-[52px] md:tracking-[-0.03em]"
          >
            One window for the whole troupe
          </h2>
          <p className="text-base leading-6 text-muted-foreground md:max-w-[560px] md:text-[17px] md:leading-[26px]">
            Every agent, every branch and every device, in one calm place.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-[816fr_416fr]">
          <Tile
            title="Every agent and model, one picker"
            description="Switch a running chat to another agent without losing the thread."
          >
            <ShotPicture
              name="bento-agents"
              alt="The model menu in the composer lists Claude Code, Codex, Gemini CLI, OpenCode and Cursor with their models."
              width={815}
            />
          </Tile>
          <Tile title="Keep going from your phone" description="Open your chats in any browser, on any device.">
            <ShotPicture
              name="bento-phone"
              alt="A Troupe chat open in a phone browser, with a compact composer."
              width={415}
            />
          </Tile>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Tile
            title="A troupe of agents working for you"
            description="Subagents and worker chats, live, on the account with the most room."
          >
            <DesktopShot background="green" width={616} height={451}>
              <AppWindow className="top-10 left-10 h-[700px] w-[900px]">
                <div className="flex w-[575px] flex-col gap-4 px-8 pt-8 pb-9 text-sm">
                  <div className="flex justify-end">
                    <p className="max-w-[420px] rounded-[14px] bg-muted px-3.5 py-2.5 leading-[21px] text-foreground">
                      Make the small text sizes work on the web build, and check every page.
                    </p>
                  </div>
                  <p className="leading-[22px] text-foreground">
                    The type check failed in two places. I sent three subagents to fix the imports, update the tests
                    and review the pages, and I am watching the dev server while they work.
                  </p>
                  <SubagentList />
                </div>
              </AppWindow>
            </DesktopShot>
          </Tile>
          <Tile
            title="Every chat on its own branch"
            description="Fresh git worktrees, diffs and a real terminal next to the chat."
          >
            <DesktopShot background="dusk" width={616} height={451}>
              <AppWindow className="top-10 left-10 h-[700px] w-[900px]">
                <Composer className="absolute top-[133.5px] left-[83.25px]">
                  <WorktreeMenu className="absolute bottom-[42px] left-2" />
                </Composer>
              </AppWindow>
            </DesktopShot>
          </Tile>
        </div>

        <Tile
          layout="row"
          title="Give agents more tools"
          description="Turn MCP servers on per chat from the composer. Your tracker, database and design files, one click away."
        >
          <DesktopShot background="pastel" width={848} height={400} className="md:border-t-0 md:border-l-[0.5px]">
            <AppWindow className="top-10 left-10 h-[700px] w-[900px]">
              <Composer className="absolute top-[173.5px] left-[23.25px]">
                <ConnectorsMenu className="absolute top-[-139.5px] left-[372px]" />
              </Composer>
            </AppWindow>
          </DesktopShot>
        </Tile>
      </Container>
    </section>
  );
}

function Tile({
  title,
  description,
  layout = 'column',
  children,
}: {
  title: string;
  description: string;
  layout?: 'column' | 'row';
  children: ReactNode;
}) {
  return (
    <article
      className={cn(
        'flex min-w-0 flex-col overflow-clip rounded-xl border-[0.5px] border-border bg-card shadow-card md:border-hairline md:shadow-[0_1px_2px_#00000080,0_3px_4px_-2px_#00000080]',
        layout === 'row' && 'md:h-[400px] md:flex-row',
      )}
    >
      <div
        className={cn(
          'flex flex-col gap-1.5 px-5 pt-[22px] pb-5 md:px-8 md:pt-7 md:pb-6',
          layout === 'row' && 'md:w-[400px] md:shrink-0',
        )}
      >
        <h3 className="text-[19px] leading-[26px] font-medium tracking-[-0.01em] text-foreground md:text-xl md:leading-7 md:tracking-[-0.015em]">
          {title}
        </h3>
        <p className="text-[15px] leading-[22px] text-muted-foreground">{description}</p>
      </div>
      {children}
    </article>
  );
}

/**
 * The photo stage with a code-built window. `width` × `height` is the shot's
 * size in the widest layout. Phone: that whole shot, scaled to the tile width
 * (`.shot-fit`, index.css). From 768px: full size, filling the tile.
 */
function DesktopShot({
  background,
  width,
  height,
  className,
  children,
}: {
  background: ShotBackground;
  width: number;
  height: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        '@container relative min-w-0 grow overflow-clip border-t-[0.5px] border-border aspect-(--shot-ratio) md:flex md:aspect-auto md:flex-col',
        className,
      )}
      style={{ '--shot-w': `${width}px`, '--shot-h': `${height}px`, '--shot-ratio': `${width} / ${height}` } as CSSProperties}
    >
      <Stage
        background={background}
        className="shot-fit absolute top-0 left-0 h-(--shot-h) w-(--shot-w) md:static md:h-auto md:min-h-(--shot-h) md:w-full md:grow"
      >
        {children}
      </Stage>
    </div>
  );
}

/**
 * A static window shot (WebP, 491px tall).
 * Phone: the whole shot, scaled to the tile width. From 768px: 491px tall,
 * cropped from the top-left when the tile is narrower than the shot.
 */
function ShotPicture({ name, alt, width }: { name: string; alt: string; width: number }) {
  return (
    <div className="grow overflow-clip border-t-[0.5px] border-border bg-window">
      <img
        src={`/media/${name}-desktop.webp`}
        srcSet={`/media/${name}-desktop.webp 1x, /media/${name}-desktop@2x.webp 2x`}
        alt={alt}
        width={width}
        height={491}
        loading="lazy"
        decoding="async"
        className="h-auto w-full md:h-[491px] md:object-cover md:object-left-top"
      />
    </div>
  );
}
