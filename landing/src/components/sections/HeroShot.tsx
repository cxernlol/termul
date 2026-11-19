import { Container } from './Container';

/**
 * The app window over the dusk photo: one static WebP at every width. On a
 * phone the whole shot scales down to the screen width, like the other shots.
 */
export function HeroShot() {
  return (
    <Container>
      <img
        src="/media/hero-desktop.webp"
        srcSet="/media/hero-desktop.webp 1x, /media/hero-desktop@2x.webp 2x"
        width={1248}
        height={780}
        alt="Troupe on macOS: the sidebar lists projects and chats with Claude Code, Codex, Gemini CLI, OpenCode and Cursor, and the composer asks “What should we do in Troupe?”"
        fetchPriority="high"
        decoding="async"
        // Last block of the hero entrance (index.css).
        className="hero-in-shot h-auto w-full rounded-xl border-[0.5px] border-border bg-[#0B0C0D] [--n:3]"
      />
    </Container>
  );
}
